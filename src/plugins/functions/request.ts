import { action, untracked, type ActionCtx, type Filter } from '../../kernel/index.js'
import { camel } from '../../lib/casing.js'
import { parseFields, readEvents } from '../../lib/sse.js'

export type RequestOptions = {
  headers?: Record<string, string>
  /** 'json' (default) sends filtered signals; 'form' serialises the closest (or `selector`) form. */
  contentType?: 'json' | 'form'
  selector?: string
  /** Which signals to send. Default: everything except paths starting with `_`. */
  filter?: Filter
  /** Explicit body instead of signals. */
  payload?: unknown
  /** 'replace' (default) aborts an earlier request with the same method and URL; 'none' lets them overlap. */
  abort?: 'replace' | 'none' | AbortController
  /** Keep the connection open while the tab is hidden. Default: true except for GET streams. */
  openWhenHidden?: boolean
  /** Reconnect after a stream closes normally (long-lived event streams). */
  reconnect?: boolean
  retry?: { attempts?: number; interval?: number; factor?: number; max?: number; onStatusError?: boolean }
}

const inflight = new Map<string, AbortController>()
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })
const untilVisible = () =>
  new Promise<void>((resolve) => document.addEventListener('visibilitychange', () => !document.hidden && resolve(), { once: true }))

const headerArgs = (res: Response, names: string[], data: Record<string, string>) => {
  for (const n of names) {
    const v = res.headers.get(`sigmx-${n}`)
    if (v) data[camel(n)] = v
  }
  return data
}

const runScript = (text: string) => {
  const s = document.createElement('script')
  s.text = text
  document.head.append(s)
  s.remove()
}

const send = async (method: string, ctx: ActionCtx, url: string, o: RequestOptions = {}): Promise<void> => {
  const { el, evt, store, runtime, error } = ctx
  if (!url) throw error(`@${method.toLowerCase()} needs a URL`)
  const key = `${method} ${url}`
  const ac = o.abort instanceof AbortController ? o.abort : new AbortController()
  if (o.abort !== 'none') {
    inflight.get(key)?.abort()
    inflight.set(key, ac)
  }
  ctx.cleanup(() => ac.abort())
  const emit = (type: string, extra: Record<string, unknown> = {}) => runtime.emit('fetch', { el, type, method, url, ...extra })
  const retry = { attempts: 5, interval: 1000, factor: 2, max: 30_000, onStatusError: false, ...o.retry }
  const pauseWhenHidden = !(o.openWhenHidden ?? method !== 'GET')
  const bodyAllowed = method !== 'GET' && method !== 'DELETE'

  const build = (): { url: string; init: RequestInit } | undefined => {
    const u = new URL(url, location.href)
    const headers: Record<string, string> = {
      Accept: 'text/event-stream, text/html, application/json',
      'Sigmx-Request': 'true',
      ...o.headers,
    }
    let body: BodyInit | undefined
    if ((o.contentType ?? 'json') === 'json') {
      const payload = o.payload ?? untracked(() => store.snapshot(o.filter ?? { exclude: /(^|\.)_/ }))
      const json = JSON.stringify(payload)
      if (bodyAllowed) {
        body = json
        headers['Content-Type'] ??= 'application/json'
      } else u.searchParams.set('sigmx', json)
    } else {
      const form = (o.selector ? document.querySelector(o.selector) : el.closest('form')) as HTMLFormElement | null
      if (!form) throw error('no form found', { selector: o.selector })
      if (!form.noValidate && !form.checkValidity()) {
        form.reportValidity()
        return
      }
      const submitter = evt instanceof SubmitEvent ? evt.submitter : el instanceof HTMLButtonElement ? el : null
      const fd = new FormData(form, submitter)
      const multipart = form.enctype === 'multipart/form-data'
      if (bodyAllowed) {
        body = multipart ? fd : new URLSearchParams(fd as unknown as Record<string, string>)
        if (!multipart) headers['Content-Type'] = 'application/x-www-form-urlencoded'
      } else {
        for (const [k, v] of new URLSearchParams(fd as unknown as Record<string, string>)) u.searchParams.append(k, v)
      }
    }
    return { url: u.toString(), init: { method, headers, body } }
  }

  const route = (event: string, data: string) => {
    const fields = parseFields(data)
    runtime.emit('server-event', { el, event, data: fields })
    runtime.handle(event, fields)
  }

  let attempt = 0
  let wait = retry.interval
  let lastId: string | undefined
  const backoff = async () => {
    if (attempt++ >= retry.attempts) throw new Error('retries exhausted')
    emit('retrying', { attempt })
    await sleep(wait, ac.signal)
    wait = Math.min(wait * retry.factor, retry.max)
  }

  emit('started')
  try {
    while (!ac.signal.aborted) {
      const req = build()
      if (!req) return
      if (lastId) (req.init.headers as Record<string, string>)['Last-Event-ID'] = lastId
      const inner = new AbortController()
      const stop = () => inner.abort()
      ac.signal.addEventListener('abort', stop, { once: true })
      const onHide = () => document.hidden && inner.abort()
      if (pauseWhenHidden) document.addEventListener('visibilitychange', onHide)
      let paused = false
      try {
        const res = await fetch(req.url, { ...req.init, signal: inner.signal })
        const ct = res.headers.get('content-type') ?? ''
        if (res.status >= 400) {
          emit('error', { status: res.status })
          if (!retry.onStatusError) return
          await backoff()
          continue
        }
        if (res.status === 204 || res.status === 304 || !res.body) return
        if (ct.includes('text/event-stream')) {
          attempt = 0
          wait = retry.interval
          await readEvents(res.body, (e) => {
            if (e.id !== undefined) lastId = e.id
            if (e.retry) wait = retry.interval = e.retry
            route(e.event, e.data)
          })
          if (!o.reconnect) return
          await backoff()
          continue
        }
        if (ct.includes('text/html')) {
          runtime.handle('patch-elements', headerArgs(res, ['selector', 'mode', 'use-view-transition'], { elements: await res.text() }))
        } else if (ct.includes('application/json')) {
          runtime.handle('patch-signals', headerArgs(res, ['only-if-missing'], { signals: await res.text() }))
        } else if (ct.includes('javascript')) {
          runScript(await res.text())
        }
        return
      } catch (e) {
        if (ac.signal.aborted) return
        if (inner.signal.aborted && pauseWhenHidden && document.hidden) {
          paused = true
          await untilVisible()
          continue
        }
        if (!paused) await backoff()
      } finally {
        ac.signal.removeEventListener('abort', stop)
        document.removeEventListener('visibilitychange', onHide)
      }
    }
  } catch (e: any) {
    emit('error', { message: e?.message })
    throw error(`${method} ${url}: ${e?.message ?? e}`)
  } finally {
    emit('finished')
    if (inflight.get(key) === ac) inflight.delete(key)
  }
}

const make = (name: string, method: string) => action({ name, call: (ctx, url: string, o?: RequestOptions) => send(method, ctx, url, o) })

/** `@get(url, options)`: signals travel in the `sigmx` query parameter. */
export const httpGet = make('get', 'GET')
export const httpPost = make('post', 'POST')
export const httpPut = make('put', 'PUT')
export const httpPatch = make('patch', 'PATCH')
export const httpDelete = make('delete', 'DELETE')

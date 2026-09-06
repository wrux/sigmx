import { type ActionCtx, type Filter, untracked } from '../../kernel/index.js';
import { camel } from '../../lib/casing.js';
import { parseFields, readEvents } from '../../lib/sse.js';
import { act } from '../def.js';

export type RequestOptions = {
  headers?: Record<string, string>;
  /** 'json' (default) sends filtered signals; 'form' serialises the closest (or `selector`) form. */
  contentType?: 'json' | 'form';
  selector?: string;
  /** Which signals to send. Default: everything except paths starting with `_`. */
  filter?: Filter;
  /** Explicit body instead of signals. */
  payload?: unknown;
  /** 'replace' (default) aborts an earlier request with the same method and URL; 'none' lets them overlap. */
  abort?: 'replace' | 'none';
  /** Keep the connection open while the tab is hidden. Default: true except for GET streams. */
  openWhenHidden?: boolean;
  /** Reconnect after a stream closes normally (long-lived event streams). */
  reconnect?: boolean;
  retry?: { attempts?: number; interval?: number; factor?: number; max?: number };
};

const inflight = new Map<string, AbortController>();
let seq = 0;
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
    signal.addEventListener('abort', () => resolve(), { once: true });
  });

/** Response headers `sigmx-<name>` become camel-cased fields of `data`. */
const headerArgs = (res: Response, names: string[], data: Record<string, string>) => {
  for (const n of names) {
    const v = res.headers.get(`sigmx-${n}`);
    if (v) data[camel(n)] = v;
  }
  return data;
};

const send = async (method: string, ctx: ActionCtx, url: string, o: RequestOptions = {}): Promise<void> => {
  const { el, evt, store, runtime, error } = ctx;
  if (!url) throw error(`@${method.toLowerCase()} needs a URL`);
  const key = `${method} ${url}`;
  const ac = new AbortController();
  if (o.abort !== 'none') {
    inflight.get(key)?.abort();
    inflight.set(key, ac);
  }
  ctx.cleanup(() => ac.abort());
  const rid = ++seq;
  const emit = (type: string, extra?: object) => runtime.emit('fetch', { el, type, method, url, rid, ...extra });
  const retry = { attempts: 5, interval: 1000, factor: 2, max: 30_000, ...o.retry };
  const hasBody = method !== 'GET' && method !== 'DELETE';

  const build = (): [string, RequestInit] | undefined => {
    const u = new URL(url, location.href);
    const headers: Record<string, string> = {
      Accept: 'text/event-stream, text/html, application/json',
      'Sigmx-Request': 'true',
      ...o.headers,
    };
    let body: BodyInit;
    let type: string | undefined;
    if ((o.contentType ?? 'json') === 'json') {
      body = JSON.stringify(o.payload ?? untracked(() => store.snapshot(o.filter ?? { exclude: /(^|\.)_/ })));
      type = 'application/json';
      if (!hasBody) u.searchParams.set('sigmx', body);
    } else {
      const form = (o.selector ? document.querySelector(o.selector) : el.closest('form')) as HTMLFormElement | null;
      if (!form) throw error('no form found', { selector: o.selector });
      if (!form.noValidate && !form.checkValidity()) return void form.reportValidity();
      const submitter =
        evt instanceof SubmitEvent ? evt.submitter : el instanceof HTMLButtonElement && el.form === form ? el : null;
      const fd = new FormData(form, submitter);
      const params = new URLSearchParams(fd as unknown as Record<string, string>);
      if (form.enctype === 'multipart/form-data') body = fd;
      else {
        body = params;
        type = 'application/x-www-form-urlencoded';
      }
      if (!hasBody) for (const [k, v] of params) u.searchParams.append(k, v);
    }
    if (hasBody && type) headers['Content-Type'] ??= type;
    return [u.href, { method, headers, body: hasBody ? body : undefined }];
  };

  let attempt = 0;
  let wait = retry.interval;
  let lastId: string | undefined;
  const backoff = async () => {
    if (attempt++ >= retry.attempts) throw new Error('retries exhausted');
    await sleep(wait, ac.signal);
    wait = Math.min(wait * retry.factor, retry.max);
  };

  emit('started');
  try {
    const req = build();
    if (!req) return;
    while (!ac.signal.aborted) {
      if (lastId) (req[1].headers as Record<string, string>)['Last-Event-ID'] = lastId;
      try {
        const res = await fetch(req[0], { ...req[1], signal: ac.signal });
        const ct = res.headers.get('content-type') ?? '';
        if (!res.ok) return emit('error', { status: res.status });
        if (!res.body) return;
        if (ct.includes('text/event-stream')) {
          attempt = 0;
          wait = retry.interval;
          await readEvents(res.body, (e) => {
            if (e.id !== undefined) lastId = e.id;
            if (e.retry) wait = retry.interval = e.retry;
            const data = parseFields(e.data);
            runtime.emit('server-event', { el, event: e.event, data });
            runtime.handle(e.event, data);
          });
          if (!o.reconnect) return;
          await backoff();
          continue;
        }
        const text = await res.text();
        if (ct.includes('text/html'))
          runtime.handle('patch-elements', headerArgs(res, ['selector', 'mode'], { elements: text }));
        else if (ct.includes('application/json'))
          runtime.handle('patch-signals', headerArgs(res, ['only-if-missing'], { signals: text }));
        return;
      } catch {
        if (ac.signal.aborted) return;
        await backoff();
      }
    }
  } catch (e: any) {
    emit('error', { message: e?.message });
    throw error(`${method} ${url}: ${e?.message ?? e}`);
  } finally {
    emit('finished');
    if (inflight.get(key) === ac) inflight.delete(key);
  }
};

const make = (name: string, method: string) =>
  act(name, (ctx, url: string, o?: RequestOptions) => send(method, ctx, url, o));

/** `@get(url, options)`: signals travel in the `sigmx` query parameter. */
export const httpGet = make('get', 'GET');
export const httpPost = make('post', 'POST');
export const httpPut = make('put', 'PUT');
export const httpPatch = make('patch', 'PATCH');
export const httpDelete = make('delete', 'DELETE');

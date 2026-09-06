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
  /** Reconnect after a stream closes normally (long-lived event streams). */
  reconnect?: boolean;
  retry?: { attempts?: number; interval?: number; factor?: number; max?: number; onStatusError?: boolean };
};

/** What a request resolves with: the last response that was applied (undefined when nothing was sent). */
export type RequestResult = { url: string; status: number; redirected: boolean } | undefined;

const inflight = new Map<string, AbortController>();
let seq = 0;
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

/** Response headers `sigmx-<name>` become camel-cased fields of `data`. */
const headerArgs = (res: Response, names: string[], data: Record<string, string>) => {
  for (const n of names) {
    const v = res.headers.get(`sigmx-${n}`);
    if (v) data[camel(n)] = v;
  }
  return data;
};

const send = async (method: string, ctx: ActionCtx, url: string, o: RequestOptions = {}): Promise<RequestResult> => {
  const { el, evt, store, runtime, error } = ctx;
  if (!url) throw error(`@${method.toLowerCase()} needs a URL`);
  const u = new URL(url, location.href);
  const key = `${method} ${u.href}`; // resolved, before any signals are appended
  const hasBody = method !== 'GET' && method !== 'DELETE';
  const headers = new Headers({ Accept: 'text/event-stream, text/html, application/json', 'Sigmx-Request': 'true' });
  for (const [k, v] of new Headers(o.headers)) headers.set(k, v);
  let body: BodyInit | undefined;
  const contentType = (t: string) => {
    if (hasBody && !headers.has('Content-Type')) headers.set('Content-Type', t);
  };
  if ((o.contentType ?? 'json') === 'json') {
    const json = JSON.stringify(o.payload ?? untracked(() => store.snapshot(o.filter ?? { exclude: /(^|\.)_/ })));
    if (hasBody) {
      body = json;
      contentType('application/json');
    } else u.searchParams.set('sigmx', json);
  } else {
    const form = (o.selector ? document.querySelector(o.selector) : el.closest('form')) as HTMLFormElement | null;
    if (!form) throw error('no form found', { selector: o.selector });
    if (!form.noValidate && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    // Only a real submit button may be the submitter; FormData throws for anything else.
    const submitter =
      evt instanceof SubmitEvent
        ? evt.submitter
        : el instanceof HTMLButtonElement && el.form === form && el.type === 'submit'
          ? el
          : null;
    const fd = new FormData(form, submitter);
    const params = new URLSearchParams(fd as unknown as Record<string, string>);
    if (!hasBody) for (const [k, v] of params) u.searchParams.append(k, v);
    else if (form.enctype === 'multipart/form-data') body = fd;
    else {
      body = params;
      contentType('application/x-www-form-urlencoded');
    }
  }

  const ac = new AbortController();
  if (o.abort !== 'none') {
    inflight.get(key)?.abort();
    inflight.set(key, ac);
  }
  const forget = ctx.cleanup(() => ac.abort());
  const rid = ++seq;
  const emit = (type: string, extra?: object) => runtime.emit('fetch', { el, type, method, url, rid, ...extra });
  const retry = { attempts: 5, interval: 1000, factor: 2, max: 30_000, ...o.retry };
  let attempt = 0;
  let wait = retry.interval;
  let lastId: string | undefined;
  let last: RequestResult;
  // Exceptions thrown while applying a response are the page's problem, not the network's: no retry.
  let applyError: unknown;
  const apply = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      applyError = e;
      throw e;
    }
  };
  const backoff = async () => {
    if (attempt++ >= retry.attempts) throw new Error('retries exhausted');
    await sleep(wait, ac.signal);
    wait = Math.min(wait * retry.factor, retry.max);
  };

  emit('started');
  try {
    while (!ac.signal.aborted) {
      if (lastId) headers.set('Last-Event-ID', lastId);
      try {
        const res = await fetch(u.href, { method, headers, body, signal: ac.signal });
        last = { url: res.url, status: res.status, redirected: res.redirected };
        const ct = res.headers.get('content-type') ?? '';
        if (!res.ok) {
          emit('error', { status: res.status });
          if (!retry.onStatusError) return last;
          await backoff();
          continue;
        }
        if (!res.body) return last;
        if (ct.includes('text/event-stream')) {
          attempt = 0;
          wait = retry.interval;
          await readEvents(res.body, (e) => {
            if (e.id !== undefined) lastId = e.id;
            if (e.retry) wait = retry.interval = e.retry;
            const data = parseFields(e.data);
            apply(() => {
              runtime.emit('server-event', { el, event: e.event, data });
              runtime.handle(e.event, data);
            });
          });
          if (!o.reconnect) return last;
          await backoff();
          continue;
        }
        const text = await res.text();
        apply(() => {
          if (ct.includes('text/html'))
            runtime.handle('patch-elements', headerArgs(res, ['selector', 'mode'], { elements: text }));
          else if (ct.includes('application/json'))
            runtime.handle('patch-signals', headerArgs(res, ['only-if-missing'], { signals: text }));
        });
        return last;
      } catch (e) {
        if (ac.signal.aborted) return last;
        if (applyError) throw e;
        await backoff();
      }
    }
    return last;
  } catch (e: any) {
    emit('error', { message: e?.message });
    throw error(`${method} ${url}: ${e?.message ?? e}`);
  } finally {
    ac.abort(); // releases a still-open body and any pending backoff
    forget();
    emit('finished', last);
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

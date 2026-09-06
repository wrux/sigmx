import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  type EventOptions,
  type ExecuteScriptOptions,
  executeScript,
  formatEvent,
  type Markup,
  type PatchElementsOptions,
  type PatchSignalsOptions,
  patchElements,
  patchSignals,
  removeElements,
  removeSignals,
  type SchemaIssue,
  type ServerEvent,
  SIGNALS_KEY,
  SSE_HEADERS,
  type StandardSchema,
  validateSignals,
} from 'sigmx/server';

export {
  EVENT_PATCH_ELEMENTS,
  EVENT_PATCH_SIGNALS,
  type EventOptions,
  type ExecuteScriptOptions,
  executeScript,
  formatEvent,
  type Markup,
  type PatchElementsOptions,
  type PatchMode,
  type PatchSignalsOptions,
  patchElements,
  patchSignals,
  removeElements,
  removeSignals,
  type SchemaIssue,
  type SchemaResult,
  type ServerEvent,
  SIGNALS_KEY,
  SSE_HEADERS,
  type StandardSchema,
} from 'sigmx/server';

/**
 * Thrown by `signals()` when the payload cannot be parsed (400) or fails validation (422). It is an
 * `HTTPException`, so Hono's default error handling answers with `getResponse()` and logs nothing.
 */
export class SignalsError extends HTTPException {
  readonly issues: ReadonlyArray<SchemaIssue>;
  constructor(message: string, issues: ReadonlyArray<SchemaIssue> = [], status: 400 | 422 = 422) {
    super(status, { message });
    this.name = 'SignalsError';
    this.issues = issues;
  }
  override getResponse(): Response {
    return Response.json({ error: this.message, issues: this.issues }, { status: this.status });
  }
  response(): Response {
    return this.getResponse();
  }
}

export interface SigmxOptions {
  /**
   * Turn a `SignalsError` thrown by `signals(schema)` into a response.
   * Default: the error's own JSON body with a 400 or 422 status.
   */
  onError?: (error: SignalsError, c: Context) => Response | Promise<Response>;
}

export interface SigmxHtmlOptions extends PatchElementsOptions {
  status?: ContentfulStatusCode;
}
export interface SigmxJsonOptions extends PatchSignalsOptions {
  status?: ContentfulStatusCode;
}

/** A live event stream. Every write is awaited so backpressure and disconnects are respected. */
export class SigmxStream {
  constructor(private readonly api: SSEStreamingApi) {}
  get closed(): boolean {
    return this.api.closed || this.api.aborted;
  }
  send(event: ServerEvent): Promise<void> {
    if (this.closed) return Promise.resolve();
    return this.api.writeSSE({ event: event.event, data: event.lines.join('\n'), id: event.id, retry: event.retry });
  }
  patchElements(html: Markup, o?: PatchElementsOptions): Promise<void> {
    return this.send(patchElements(html, o));
  }
  removeElements(selector: string, o?: EventOptions): Promise<void> {
    return this.send(removeElements(selector, o));
  }
  patchSignals(signals: Record<string, unknown> | string, o?: PatchSignalsOptions): Promise<void> {
    return this.send(patchSignals(signals, o));
  }
  removeSignals(paths: string[], o?: EventOptions): Promise<void> {
    return this.send(removeSignals(paths, o));
  }
  executeScript(script: string, o?: ExecuteScriptOptions): Promise<void> {
    return this.send(executeScript(script, o));
  }
  /** Wait, resolving early if the client disconnects. */
  sleep(ms: number): Promise<unknown> {
    return this.api.sleep(ms);
  }
  onAbort(fn: () => void | Promise<void>): void {
    this.api.onAbort(fn);
  }
  close(): Promise<void> {
    return this.api.close();
  }
}

export interface SigmxContext {
  /** True when the request was made by the sigmx client. Use it to send a partial instead of a whole page. */
  readonly isRequest: boolean;
  /**
   * The signals the request carries: the `sigmx` query parameter on GET and DELETE, a JSON body otherwise,
   * or form fields for `contentType: 'form'` requests. With a Standard Schema validator (Zod, Valibot, ArkType…)
   * the result is typed and invalid payloads become a 422 response.
   */
  signals(): Promise<Record<string, any>>;
  signals<T>(schema: StandardSchema<T>): Promise<T>;
  /** HTML the client morphs by id, or into `selector` with `mode`. Accepts strings, `html` templates and Hono JSX. */
  html(body: string | Promise<string>, o?: SigmxHtmlOptions): Response | Promise<Response>;
  json(signals: Record<string, unknown>, o?: SigmxJsonOptions): Response;
  events(...events: ServerEvent[]): Response;
  /** A long-lived stream; the response closes when `fn` resolves or the client disconnects. */
  stream(fn: (stream: SigmxStream) => Promise<void> | void): Response;
}

declare module 'hono' {
  interface ContextVariableMap {
    sigmx: SigmxContext;
  }
}

const readSignals = async (c: Context, schema?: StandardSchema<any>): Promise<any> => {
  let raw: unknown;
  const method = c.req.method.toUpperCase();
  const type = c.req.header('content-type') ?? '';
  try {
    if (method === 'GET' || method === 'DELETE') {
      const q = c.req.query(SIGNALS_KEY);
      raw = q ? JSON.parse(q) : {};
    } else if (type.includes('application/json')) {
      const text = await c.req.text();
      raw = text ? JSON.parse(text) : {};
    } else if (type.includes('form')) {
      raw = await c.req.parseBody();
    } else {
      raw = {};
    }
  } catch (e) {
    throw new SignalsError(`could not parse signals: ${(e as Error).message}`, [], 400);
  }
  try {
    return await validateSignals(raw, schema);
  } catch (e) {
    const err = e as { message: string; issues?: ReadonlyArray<SchemaIssue> };
    throw new SignalsError(err.message, err.issues ?? [], 422);
  }
};

const contextFor = (c: Context): SigmxContext => ({
  isRequest: c.req.header('sigmx-request') === 'true',
  signals: (schema?: StandardSchema<any>) => readSignals(c, schema),
  html: (body, o = {}) => {
    if (o.selector) c.header('sigmx-selector', o.selector);
    if (o.mode) c.header('sigmx-mode', o.mode);
    if (o.useViewTransition) c.header('sigmx-use-view-transition', 'true');
    return c.html(body, o.status ?? 200);
  },
  json: (signals, o = {}) => {
    if (o.onlyIfMissing) c.header('sigmx-only-if-missing', 'true');
    return c.json(signals, o.status ?? 200);
  },
  events: (...events) => c.body(events.map(formatEvent).join(''), 200, SSE_HEADERS),
  stream: (fn) =>
    streamSSE(c, async (api) => {
      await fn(new SigmxStream(api));
    }),
});

/**
 * Middleware that attaches `c.var.sigmx` to every request. A `SignalsError` escaping a handler is turned
 * into its JSON response (or whatever `onError` returns); every other error is left to `app.onError`.
 */
export const sigmx = (o: SigmxOptions = {}): MiddlewareHandler =>
  createMiddleware(async (c, next) => {
    c.set('sigmx', contextFor(c));
    await next();
    if (c.error instanceof SignalsError) c.res = o.onError ? await o.onError(c.error, c) : c.error.response();
  });

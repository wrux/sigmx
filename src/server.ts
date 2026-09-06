export const SIGNALS_KEY = 'sigmx';
export const EVENT_PATCH_ELEMENTS = 'sigmx-patch-elements';
export const EVENT_PATCH_SIGNALS = 'sigmx-patch-signals';
export const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
} as const;

/** HTML as a string, or anything that renders to one such as a JSX node or an `html` template. */
export type Markup = string | { toString(): string };

export type PatchMode = 'outer' | 'inner' | 'replace' | 'prepend' | 'append' | 'before' | 'after' | 'remove';

export interface ServerEvent {
  event: string;
  /** Data lines, each `key value`. */
  lines: string[];
  id?: string;
  retry?: number;
}
export interface EventOptions {
  id?: string;
  retry?: number;
}
export interface PatchElementsOptions extends EventOptions {
  selector?: string;
  mode?: PatchMode;
}
export interface PatchSignalsOptions extends EventOptions {
  onlyIfMissing?: boolean;
}
export interface ExecuteScriptOptions extends EventOptions {
  /** Remove the script element after it runs (default true). */
  autoRemove?: boolean;
  attributes?: Record<string, string>;
}

/** Patch HTML into the page. Without a selector, top-level elements are morphed by id. */
export const patchElements = (html: Markup, o: PatchElementsOptions = {}): ServerEvent => {
  const lines: string[] = [];
  if (o.selector) lines.push(`selector ${o.selector}`);
  if (o.mode && o.mode !== 'outer') lines.push(`mode ${o.mode}`);
  lines.push(`elements ${String(html).trim()}`);
  return { event: EVENT_PATCH_ELEMENTS, lines, id: o.id, retry: o.retry };
};

export const removeElements = (selector: string, o: EventOptions = {}): ServerEvent => ({
  event: EVENT_PATCH_ELEMENTS,
  lines: [`selector ${selector}`, 'mode remove'],
  ...o,
});

/** Merge signals (JSON merge-patch: null removes). Accepts an object or pre-serialised JSON. */
export const patchSignals = (signals: Record<string, unknown> | string, o: PatchSignalsOptions = {}): ServerEvent => ({
  event: EVENT_PATCH_SIGNALS,
  lines: [
    ...(o.onlyIfMissing ? ['onlyIfMissing true'] : []),
    `signals ${typeof signals === 'string' ? signals : JSON.stringify(signals)}`,
  ],
  id: o.id,
  retry: o.retry,
});

export const removeSignals = (paths: string[], o: EventOptions = {}): ServerEvent => {
  const patch: Record<string, any> = {};
  for (const p of paths) {
    const keys = p.split('.');
    const last = keys.pop() as string;
    let cur = patch;
    for (const k of keys) cur = cur[k] ??= {};
    cur[last] = null;
  }
  return patchSignals(patch, o);
};

export const executeScript = (script: string, o: ExecuteScriptOptions = {}): ServerEvent => {
  const attrs = { ...((o.autoRemove ?? true) ? { 'data-init': 'el.remove()' } : {}), ...o.attributes };
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v.replace(/"/g, '&quot;')}"`)
    .join('');
  return patchElements(`<script${attrText}>${script}</script>`, {
    selector: 'body',
    mode: 'append',
    id: o.id,
    retry: o.retry,
  });
};

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

/**
 * One event on the wire. A `key value` line whose value spans several lines becomes several
 * `data: key …` lines (the client joins them again), so no value can inject an extra field or event.
 */
export const formatEvent = (e: ServerEvent): string =>
  `${[
    e.id !== undefined && `id: ${oneLine(e.id)}`,
    e.retry !== undefined && `retry: ${e.retry}`,
    `event: ${oneLine(e.event)}`,
    ...e.lines.flatMap((l) => {
      const i = l.indexOf(' ');
      const key = i < 0 ? l : l.slice(0, i);
      return (i < 0 ? [''] : l.slice(i + 1).split(/\r?\n/)).map((v) => `data: ${key}${i < 0 ? '' : ` ${v}`}`);
    }),
  ]
    .filter(Boolean)
    .join('\n')}\n\n`;

export class SigmxStream {
  readonly response: Response;
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private readonly encoder = new TextEncoder();
  private open = true;

  constructor(init: ResponseInit = {}) {
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        this.controller = c;
      },
      cancel: () => {
        this.open = false;
      },
    });
    this.response = new Response(body, {
      ...init,
      headers: { ...SSE_HEADERS, ...(init.headers as Record<string, string>) },
    });
  }
  get closed(): boolean {
    return !this.open;
  }
  send(event: ServerEvent): this {
    if (this.open) this.controller.enqueue(this.encoder.encode(formatEvent(event)));
    return this;
  }
  patchElements(html: Markup, o?: PatchElementsOptions): this {
    return this.send(patchElements(html, o));
  }
  removeElements(selector: string, o?: EventOptions): this {
    return this.send(removeElements(selector, o));
  }
  patchSignals(signals: Record<string, unknown> | string, o?: PatchSignalsOptions): this {
    return this.send(patchSignals(signals, o));
  }
  removeSignals(paths: string[], o?: EventOptions): this {
    return this.send(removeSignals(paths, o));
  }
  executeScript(script: string, o?: ExecuteScriptOptions): this {
    return this.send(executeScript(script, o));
  }
  close(): void {
    if (this.open) {
      this.open = false;
      this.controller.close();
    }
  }
  /** End the stream with an error so the client sees a failure (and retries) rather than a clean end. */
  error(reason: unknown): void {
    if (this.open) {
      this.open = false;
      this.controller.error(reason);
    }
  }
}

export const sse = (...events: ServerEvent[]): Response =>
  new Response(events.map(formatEvent).join(''), { headers: SSE_HEADERS });

/** Stream events while `fn` runs; the response closes when it resolves. */
export const sseStream = (fn: (stream: SigmxStream) => Promise<void> | void, init?: ResponseInit): Response => {
  const stream = new SigmxStream(init);
  Promise.resolve()
    .then(() => fn(stream))
    .then(
      () => stream.close(),
      (e) => {
        console.error('sigmx sseStream:', e);
        stream.error(e);
      },
    );
  return stream.response;
};

/** A plain HTML response; the client morphs it by id, or honours the selector and mode headers. */
export const html = (body: Markup, o: PatchElementsOptions & { status?: number } = {}): Response =>
  new Response(String(body), {
    status: o.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...(o.selector ? { 'sigmx-selector': o.selector } : {}),
      ...(o.mode ? { 'sigmx-mode': o.mode } : {}),
    },
  });

export const json = (signals: Record<string, unknown>, o: PatchSignalsOptions & { status?: number } = {}): Response =>
  new Response(JSON.stringify(signals), {
    status: o.status ?? 200,
    headers: { 'content-type': 'application/json', ...(o.onlyIfMissing ? { 'sigmx-only-if-missing': 'true' } : {}) },
  });

/** Minimal Standard Schema (standardschema.dev) so any compliant validator works without a dependency. */
export interface StandardSchema<Output = unknown> {
  readonly '~standard': {
    readonly validate: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>;
  };
}
export type SchemaIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
};
export type SchemaResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<SchemaIssue> };

export class SignalsError extends Error {
  constructor(
    message: string,
    readonly issues: ReadonlyArray<SchemaIssue> = [],
    readonly status: 400 | 422 = 422,
  ) {
    super(message);
    this.name = 'SignalsError';
  }
  response(): Response {
    return Response.json({ error: this.message, issues: this.issues }, { status: this.status });
  }
}

/** Form fields as an object; a repeated name becomes an array. */
export const fieldsToObject = (entries: Iterable<[string, unknown]>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of entries) out[k] = k in out ? ([] as unknown[]).concat(out[k], v) : v;
  return out;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read the signals a sigmx request carries: the `sigmx` query parameter on GET/DELETE (or the plain
 * query parameters of a `contentType: 'form'` GET), a JSON body, or form fields. Validates with `schema` if given.
 */
export async function readSignals(request: Request): Promise<Record<string, any>>;
export async function readSignals<T>(request: Request, schema: StandardSchema<T>): Promise<T>;
export async function readSignals(request: Request, schema?: StandardSchema<any>): Promise<any> {
  let raw: unknown;
  const method = request.method.toUpperCase();
  const type = request.headers.get('content-type') ?? '';
  try {
    if (method === 'GET' || method === 'DELETE') {
      const params = new URL(request.url).searchParams;
      const q = params.get(SIGNALS_KEY);
      raw = q ? JSON.parse(q) : fieldsToObject(params);
    } else if (type.includes('application/json')) {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } else if (type.includes('form')) {
      raw = fieldsToObject(await request.formData());
    } else {
      raw = {};
    }
  } catch (e) {
    throw new SignalsError(`could not parse signals: ${(e as Error).message}`, [], 400);
  }
  if (!isObject(raw)) throw new SignalsError('signals must be an object', [], 400);
  return validateSignals(raw, schema);
}

const describeIssue = (i: SchemaIssue): string => {
  const path = i.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.');
  return path ? `${path}: ${i.message}` : i.message;
};

export async function validateSignals(raw: unknown, schema?: StandardSchema<any>): Promise<any> {
  if (!schema) return raw;
  const result = await schema['~standard'].validate(raw);
  if (result.issues)
    throw new SignalsError(`invalid signals: ${result.issues.map(describeIssue).join('; ')}`, result.issues);
  return result.value;
}

export const isSigmxRequest = (request: Request): boolean => request.headers.get('sigmx-request') === 'true';

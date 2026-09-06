export type ServerEvent = { event: string; data: string; id?: string; retry?: number };
type StreamState = { id?: string; retry?: number };

/**
 * Parse one blank-line-delimited block of `field: value` lines (the SSE wire format). `id` and
 * `retry` persist in `state` across blocks; comments start with `:`. Undefined without data lines.
 */
export const parseBlock = (block: string, state: StreamState = {}): ServerEvent | undefined => {
  let event = '';
  const data: string[] = [];
  for (const l of block.split(/\r?\n/)) {
    const c = l.indexOf(':');
    if (!c) continue;
    const field = c < 0 ? l : l.slice(0, c);
    const v = (c < 0 ? '' : l.slice(c + 1)).replace(/^ /, '');
    if (field === 'event') event = v;
    else if (field === 'data') data.push(v);
    else if (field === 'id') state.id = v;
    else if (field === 'retry' && /^\d+$/.test(v)) state.retry = +v;
  }
  if (data.length) return { event: event || 'message', data: data.join('\n'), id: state.id, retry: state.retry };
};

export const readEvents = async (
  body: ReadableStream<Uint8Array>,
  onEvent: (e: ServerEvent) => void,
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: StreamState = {};
  let buffer = '';
  let scan = 0; // where the next separator search starts: no rescanning of a large partial event
  const dispatch = (block: string) => {
    const e = parseBlock(block, state);
    if (e) onEvent(e);
  };
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const sep = /\r?\n\r?\n/g;
    sep.lastIndex = scan;
    for (let m = sep.exec(buffer); m; m = sep.exec(buffer)) {
      dispatch(buffer.slice(0, m.index));
      buffer = buffer.slice(m.index + m[0].length);
      sep.lastIndex = 0;
    }
    scan = Math.max(0, buffer.length - 3);
    if (done) {
      dispatch(buffer);
      break;
    }
  }
};

/** Event payloads: each data line is `key value`; repeated keys join with newlines. */
export const parseFields = (data: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const l of data.split('\n')) {
    const i = l.indexOf(' ');
    const k = i < 0 ? l : l.slice(0, i);
    const v = i < 0 ? '' : l.slice(i + 1);
    out[k] = k in out ? `${out[k]}\n${v}` : v;
  }
  return out;
};

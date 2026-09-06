export type ServerEvent = { event: string; data: string; id?: string; retry?: number };

export const readEvents = async (
  body: ReadableStream<Uint8Array>,
  onEvent: (e: ServerEvent) => void,
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;
  const flush = () => {
    if (data.length) onEvent({ event: event || 'message', data: data.join('\n'), id, retry });
    event = '';
    data = [];
  };
  const line = (l: string) => {
    if (!l) return flush();
    if (l[0] === ':') return;
    const c = l.indexOf(':');
    const field = c < 0 ? l : l.slice(0, c);
    let v = c < 0 ? '' : l.slice(c + 1);
    if (v[0] === ' ') v = v.slice(1);
    if (field === 'event') event = v;
    else if (field === 'data') data.push(v);
    else if (field === 'id') id = v;
    else if (field === 'retry' && /^\d+$/.test(v)) retry = +v;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const i = buffer.search(/\r\n|\r|\n/);
      if (i < 0) break;
      const l = buffer.slice(0, i);
      buffer = buffer.slice(i + (buffer[i] === '\r' && buffer[i + 1] === '\n' ? 2 : 1));
      line(l);
    }
  }
  if (buffer) line(buffer);
  flush();
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

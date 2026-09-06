// Minimal helpers for the sigmx wire format on a Node response. Each event is a block of
// `data: <field> <value>` lines; elements may span several lines, one `elements` line each.

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

/** Morph HTML into the page: top-level elements by id, or a selector plus mode. */
export const patchElements = (html, { selector, mode } = {}) => ({
  event: 'sigmx-patch-elements',
  lines: [
    ...(selector ? [`selector ${selector}`] : []),
    ...(mode && mode !== 'outer' ? [`mode ${mode}`] : []),
    ...html
      .trim()
      .split('\n')
      .map((l) => `elements ${l}`),
  ],
});

/** Merge signals (JSON merge-patch: null removes a signal). */
export const patchSignals = (signals) => ({
  event: 'sigmx-patch-signals',
  lines: [`signals ${JSON.stringify(signals)}`],
});

export const formatEvent = ({ event, lines }) => `event: ${event}\n${lines.map((l) => `data: ${l}`).join('\n')}\n\n`;

/** A complete response holding one or more events, sent at once. */
export const sendEvents = (res, ...events) => res.set(SSE_HEADERS).send(events.map(formatEvent).join(''));

/** A long-lived stream you write events to; resolves `closed` when the client goes away. */
export const openStream = (req, res) => {
  res.set(SSE_HEADERS).flushHeaders();
  let open = true;
  const closed = new Promise((resolve) =>
    req.on('close', () => {
      open = false;
      resolve();
    }),
  );
  return {
    closed,
    get open() {
      return open;
    },
    send: (...events) => open && res.write(events.map(formatEvent).join('')),
    end: () => open && res.end(),
  };
};

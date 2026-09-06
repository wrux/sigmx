// Minimal helpers for the sigmx wire format using only Web Request/Response, so they run on Node,
// Bun, Deno and Cloudflare Workers alike. Each event is a block of `data: <field> <value>` lines.

export const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
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
export const events = (...list) => new Response(list.map(formatEvent).join(''), { headers: SSE_HEADERS });

/** A long-lived stream: `fn` receives `send` and `open`; the response closes when `fn` resolves. */
export const stream = (fn) => {
  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream({
    start(controller) {
      const send = (...list) => open && controller.enqueue(encoder.encode(list.map(formatEvent).join('')));
      Promise.resolve()
        .then(() => fn(send, () => open))
        .catch((e) => console.error('sigmx stream:', e))
        .finally(() => {
          if (open) controller.close();
          open = false;
        });
    },
    cancel() {
      open = false;
    },
  });
  return new Response(body, { headers: SSE_HEADERS });
};

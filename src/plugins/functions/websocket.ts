import { parseBlock, parseFields } from '../../lib/sse.js';
import { act } from '../def.js';

export type Socket = { send(data: unknown): void; close(): void; readonly socket: WebSocket };

/**
 * `@ws(url, { protocols })` opens a WebSocket whose messages use the server-event wire format
 * (`event <name>` and `data <key> <value>` lines, blank-line separated) and routes them to the
 * same handlers as fetched streams. Returns `{ send, close, socket }`; closed when the element unmounts.
 */
export const websocket = act(
  'ws',
  ({ el, runtime, cleanup }, url: string, o: { protocols?: string | string[] } = {}): Socket => {
    const socket = new WebSocket(new URL(url, location.href.replace(/^http/, 'ws')), o.protocols);
    socket.onmessage = (m) => {
      if (typeof m.data !== 'string') return; // binary frames are not server events
      for (const block of m.data.split(/(?:\r?\n){2,}/)) {
        const e = parseBlock(block);
        if (!e) continue;
        const data = parseFields(e.data);
        runtime.emit('server-event', { el, event: e.event, data });
        runtime.handle(e.event, data);
      }
    };
    cleanup(() => socket.close());
    return {
      send: (d) => socket.send(typeof d === 'string' ? d : JSON.stringify(d)),
      close: () => socket.close(),
      socket,
    };
  },
);

import { action } from '../../kernel/index.js'

export type Socket = { send(data: unknown): void; close(): void; readonly socket: WebSocket }

/**
 * `@ws('/live')` opens a WebSocket and routes incoming messages like a server event stream: text
 * blocks of `event: name` and `data: key value` lines, separated by blank lines. Returns
 * `{ send, close, socket }`; `send` JSON-encodes objects. The socket closes when the element unmounts.
 */
export const websocket = action({
  name: 'ws',
  call({ el, runtime, cleanup }, url: string, o: { protocols?: string | string[] } = {}): Socket {
    const socket = new WebSocket(new URL(url, location.href.replace(/^http/, 'ws')), o.protocols)
    socket.onmessage = (m) => {
      for (const block of String(m.data).split(/\n\n+/)) {
        let event = 'message'
        const data: Record<string, string> = {}
        for (const line of block.split('\n')) {
          const i = line.indexOf(':')
          if (i < 0) continue
          const field = line.slice(0, i)
          const v = line.slice(i + 1).trimStart()
          if (field === 'event') event = v
          else if (field === 'data') {
            const j = v.indexOf(' ')
            const k = j < 0 ? v : v.slice(0, j)
            const val = j < 0 ? '' : v.slice(j + 1)
            data[k] = k in data ? `${data[k]}\n${val}` : val
          }
        }
        runtime.emit('server-event', { el, event, data })
        runtime.handle(event, data)
      }
    }
    cleanup(() => socket.close())
    return { send: (d) => socket.send(typeof d === 'string' ? d : JSON.stringify(d)), close: () => socket.close(), socket }
  },
})

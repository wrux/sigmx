// Zero-dependency dev server: static files plus test endpoints for the fetch client.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const port = +(process.env.PORT || 8765)
const root = process.cwd()
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.map': 'application/json', '.css': 'text/css', '.json': 'application/json', '.ts': 'text/plain' }
const sse = (res, legacy = false) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const p = legacy ? 'datastar-' : 'sigmx-'
  const ev = (name, lines, id) => res.write(`${id ? `id: ${id}\n` : ''}event: ${p}${name}\n${lines.map((l) => `data: ${l}`).join('\n')}\n\n`)
  return ev
}
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)) })

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  const q = url.searchParams
  try {
    switch (url.pathname) {
      case '/api/json':
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ fromServer: 42, echo: q.get('sigmx') ? JSON.parse(q.get('sigmx')) : null }))
      case '/api/html':
        return res.writeHead(200, { 'content-type': 'text/html' }).end('<div id="server-box"><b>from server</b><input id="keep-me" value="server"></div>')
      case '/api/html-append':
        return res.writeHead(200, { 'content-type': 'text/html', 'sigmx-selector': '#list', 'sigmx-mode': 'append' }).end('<li class="row">appended</li>')
      case '/api/sse': {
        const body = await readBody(req)
        const ev = sse(res)
        ev('patch-signals', ['signals {"stream": 1}'], '1')
        setTimeout(() => ev('patch-elements', ['elements <div id="server-box">', 'elements <i>via sse</i></div>'], '2'), 30)
        setTimeout(() => { ev('patch-signals', [`signals {"posted": ${JSON.stringify(body || null)}}`], '3'); res.end() }, 60)
        return
      }
      case '/api/legacy': {
        const ev = sse(res, true)
        ev('patch-signals', ['signals {"legacy": true}'])
        return res.end()
      }
      case '/api/slow':
        return setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end('{"slow": true}'), 250)
      case '/api/fail':
        return res.writeHead(500).end('nope')
      case '/api/form': {
        const body = await readBody(req)
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ form: Object.fromEntries(new URLSearchParams(body)) }))
      }
    }
    const file = normalize(join(root, decodeURIComponent(url.pathname === '/' ? '/examples/index.html' : url.pathname)))
    if (!file.startsWith(root)) return res.writeHead(403).end()
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(data)
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500).end(String(e))
  }
}).listen(port, () => console.log(`sigmx dev server http://localhost:${port}`))

# Examples

Standalone projects that install `sigmx` and `@sigmx/astro` from npm, the way a user would. Each one is styled with Tailwind and shows the same handful of ideas against a different stack: signals in markup, HTML from the server morphed into the page, and a streamed response.

| directory | shows |
|---|---|
| [`vite`](vite) | Vite with `sigmxAuto()` from `sigmx/vite`, a custom directive picked up by auto mode, and a dev-server endpoint returning HTML |
| [`express`](express) | Express 5 serving the script-tag build straight from `node_modules` with no bundler; HTML from GET and POST, a urlencoded form, and a streamed progress endpoint written with a 40-line SSE helper |
| [`hono`](hono) | Hono on `@hono/node-server`, the same endpoints written against Web `Request`/`Response` so the server code also runs on Bun, Deno or Cloudflare Workers; its SSE helper is built on `ReadableStream` |
| [`astro`](astro) | `@sigmx/astro` in auto mode with precompiled expressions, a plain HTML endpoint that morphs a list, and a streamed progress endpoint |

```bash
cd examples/vite && npm install && npm run dev     # http://localhost:5173
cd examples/express && npm install && npm run dev  # http://localhost:3000
cd examples/hono && npm install && npm run dev     # http://localhost:3001
cd examples/astro && npm install && npm run dev    # http://localhost:4321
```

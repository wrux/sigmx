# Examples

Standalone projects that install `sigmx`, `@sigmx/astro` and `@sigmx/hono` from npm, the way a user would. Each one is styled with Tailwind and shows the same handful of ideas against a different stack: signals in markup, HTML from the server morphed into the page, and a streamed response.

| directory            | shows                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`vite`](vite)       | Vite with `sigmxAuto()` from `sigmx/vite`, a custom directive picked up by auto mode, and a dev-server endpoint returning HTML                                                                                                                                                                           |
| [`express`](express) | Express 5 serving the script-tag build straight from `node_modules` with no bundler; HTML from GET and POST, a urlencoded form, and a streamed progress endpoint written with a 40-line SSE helper                                                                                                       |
| [`hono`](hono)       | Hono with the `@sigmx/hono` middleware: `c.var.sigmx.signals()`, `events()` and `stream()` in the handlers, pages and partials rendered with Hono JSX (run by `tsx`, no bundler), the client served from `node_modules` by `serveClient()`; the server code also runs on Bun, Deno or Cloudflare Workers |
| [`astro`](astro)     | `@sigmx/astro` in auto mode with precompiled expressions, a plain HTML endpoint that morphs a list, and a streamed progress endpoint                                                                                                                                                                     |

```bash
cd examples/vite && npm install && npm run dev     # http://localhost:5173
cd examples/express && npm install && npm run dev  # http://localhost:3000
cd examples/hono && npm install && npm run dev     # http://localhost:3001
cd examples/astro && npm install && npm run dev    # http://localhost:4321
```

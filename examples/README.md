# Examples

Standalone projects that install `sigmx`, `@sigmx/astro` and `@sigmx/hono` from npm, the way a user would. The Rust examples (a native axum server and a Cloudflare Worker whose client is built by cargo alone) live with the crate in [`sdks/rust`](../sdks/rust#readme). Each one is styled with Tailwind and shows the same handful of ideas against a different stack: signals in markup, HTML from the server morphed into the page, and a streamed response. Every example ships a client bundle with only the plugins it uses; the every-plugin script-tag build is 11.8 KB brotli, these land between 8.4 and 9.5 KB.

| directory            | shows                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`vite`](vite)       | Vite with `sigmxAuto()` from `sigmx/vite`, a custom directive picked up by auto mode, and a dev-server endpoint returning HTML                                                                                                                                                                           |
| [`express`](express) | Express 5 with a Vite build step that bundles only the plugins `index.html` and `server.js` use (`sigmxAuto()` from `sigmx/vite`, 9.3 KB brotli), served from `public/`; HTML from GET and POST, a urlencoded form, and a streamed progress endpoint written with a 40-line SSE helper                        |
| [`hono`](hono)       | Hono with the `@sigmx/hono` middleware: `c.var.sigmx.signals()`, `events()` and `stream()` in the handlers, pages and partials rendered with Hono JSX (run by `tsx`), the client bundled by Vite in auto mode and served by `serveClient({ path })` (9.3 KB brotli); the server code also runs on Bun, Deno or Cloudflare Workers                      |
| [`astro`](astro)     | `@sigmx/astro` in auto mode with precompiled expressions and no runtime compiler (`precompile: { fallback: false }`, 8.4 KB brotli), a plain HTML endpoint that morphs a list, and a streamed progress endpoint                                                                                          |

```bash
cd examples/vite && npm install && npm run dev     # http://localhost:5173
cd examples/express && npm install && npm run dev  # http://localhost:3000
cd examples/hono && npm install && npm run dev     # http://localhost:3001
cd examples/astro && npm install && npm run dev    # http://localhost:4321
```

---
title: "Testing and development"
description: "The repository's test suites and dev server."
sidebar: { order: 13 }
---

The suite has five layers, each runnable on its own:

| command | what it covers | how |
|---|---|---|
| `npm run test:unit` | reactive graph, store, compiler, precompiler, scan, `sigmx/server`, the helper libraries | `node:test`, no DOM |
| `npm run test:dom` | every directive, function and server-event handler, the morph, the request client with a mocked `fetch`, the runtime's mount and teardown rules | `node:test` with happy-dom as the global DOM |
| `npm run test:audit` | the feature audit: `tests/audit/probes.mjs` holds 148 behavioural probes against the public API, and `tests/audit/features.test.mjs` pins which must pass and which are flagged as removed | `node:test` against the built `dist` |
| `npm run test:browser` | what a simulated DOM cannot do: transitions and animations, observers, WebSocket, boost, the standalone script-tag build | Playwright drives `tests/browser/index.html` against the dev server in headless Chromium |
| `npm run test:sdks` | the Astro integration hooks and the Hono middleware | `node:test`, requests made with `app.request()` |

`npm test` builds, then runs the unit, DOM and audit layers; `npm run test:all` adds the browser and SDK layers. `npm run test:coverage` prints Node's coverage report for the unit and DOM layers. `npm run audit` runs the probes against an earlier build (`main` by default, or `--ref v0.1.1`) and prints a before/after matrix. The browser layer needs Chromium once: `npx playwright install chromium`.

The DOM layer mirrors `src/plugins/`: every plugin source file has a test file of the same name under `tests/dom/directives`, `tests/dom/functions` or `tests/dom/server-events`, and a guard test fails when one is missing. Browser-only APIs (observers, `animate`, WebSocket, `CSS.supports`) are stubbed in those tests; the browser layer runs the real thing.

The DOM layer is where most tests belong. Its helper (`tests/dom/helpers.mjs`) creates an instance observing a stage element, collects everything reported through `onError`, and tears it all down when the test ends:

```js
test('text renders a signal', async (t) => {
  const { $, render } = app(t);
  $.n = 1;
  const el = await render('<span data-text="$n"></span>');
  assert.equal(el.textContent, '1');
});
```

`mockFetch(t, handler)` replaces `fetch` for one test and records every request; `htmlResponse`, `jsonResponse`, `sseResponse` and `streamResponse` build the replies. Reach for the browser harness only when the behaviour depends on layout, animation or a real network stack.

The dev server the browser layer uses is also handy on its own; it serves the repository and provides event-stream, JSON, HTML, form and WebSocket endpoints under `/api`:

```bash
npm run dev       # http://localhost:8765, suite at /tests/browser/index.html
```

Continuous integration runs every layer on each push and pull request (`.github/workflows/ci.yml`): lint, type-check, the unit, DOM and audit tests and the size script on Node 20 and 22, the Astro and Hono SDK suites, the Rust crate (fmt, clippy, tests, wasm32 checks), the browser layer, the docs build and the example apps.

Other scripts: `npm run check` (type-check), `npm run lint` and `npm run format` (Biome), `npm run build` (one ESM module per source file plus `.d.ts`, and the standalone bundle), `npm run size` (this site's size tables).

# sigmx

[![CI](https://github.com/wrux/sigmx/actions/workflows/ci.yml/badge.svg)](https://github.com/wrux/sigmx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sigmx)](https://www.npmjs.com/package/sigmx)

**The power of a modern framework, in a runtime the browser barely notices.**

Your server renders HTML, as it always has. The browser asks for more of it with `@get` and `@post`, and sigmx merges the response into the page with a morph that keeps focus, typed input and scroll position. Client state lives in signals declared in markup; two-way binding, computed values and effects keep the page in step. When one request should keep delivering, the same call reads a stream of patches. Everything beyond the 4.5 KB core is a plugin, and a build step reads your markup and registers exactly the plugins it uses.

> **Status: an experiment, nearly 1.0.** sigmx is a personal exploration of what a hypermedia framework looks like when it starts from a tiny, plugin-based core and lets the build do the heavy lifting. It is inspired by [htmx](https://htmx.org) (the server sends HTML, the browser swaps it in), [Alpine.js](https://alpinejs.dev) (declarative `data-*` attributes with a little reactivity) and [Datastar](https://data-star.dev) (which fused the two and whose attribute syntax sigmx keeps for compatibility). The code is original, the public surface follows semantic versioning, and it has not yet been used in production. Try it, break it, and open an issue with what you find.

```html
<div data-signals="{ count: 0, name: '' }">
  <input data-bind:name placeholder="Your name" />
  <p data-show="$name">Hello, <span data-text="$name"></span>!</p>
  <button data-on:click="$count++">Clicked <b data-text="$count"></b> times</button>
  <button data-on:click="@post('/save')" data-indicator:saving data-attr:disabled="$saving">Save</button>
</div>
```

- **Tiny.** 4.5 KB core, 9.0 KB with the essentials, 11.5 KB with all 50 plugins (brotli); 3.8 KB core with precompiled expressions. Zero runtime dependencies.
- **Server-driven.** Return plain HTML from any endpoint and it is morphed into the page by id, or targeted with a header. Return JSON to merge signals, or an event stream to push many patches over one request, with `Last-Event-ID` reconnects.
- **Reactive where it matters.** Signals declared in markup; `bind`, `show`, `class`, computed values and effects keep the page in step. No component model, no virtual DOM.
- **The build decides what ships.** Auto mode scans your source and bundles only the plugins it finds; precompilation turns every expression into a function at build time, so the browser never calls `new Function` and a strict CSP needs no exceptions.
- **Batteries from the ecosystem.** The Alpine plugins (`collapse`, `mask`, `teleport`, …) and htmx extensions (`boost`, `ws`, `remove-me`, …) people bolt on are built in as plugins.
- **Made to be extended.** Directives, functions and server-event handlers are plain objects made with three helpers; yours are scanned, precompiled and torn down like the built-ins.
- **Datastar-compatible markup.** Existing Datastar templates run unchanged.

## Install

```bash
npm install sigmx
```

```ts
import { createSigmx } from 'sigmx';
import { essentials } from 'sigmx/presets/essentials';

createSigmx({ plugins: essentials });
```

Or pick plugins by hand (`sigmx/plugins` is tree-shakeable), use `sigmx/presets/minimal` or `sigmx/presets/all`, let [auto mode](#the-build) choose, or drop in the script-tag build:

```html
<script type="module" src="/sigmx.standalone.js"></script>
```

Astro users: `npm install sigmx @sigmx/astro` and add `sigmx()` to the integrations; see [sdks/astro](sdks/astro). Hono users: `npm install sigmx @sigmx/hono`, then `app.use(sigmx())` gives every handler `c.var.sigmx`; see [sdks/hono](sdks/hono). Rust users: the `sigmx` crate has axum and Cloudflare Workers integrations and embeds the client, so a project without Node can still ship it; see [sdks/rust](sdks/rust). Everyone else: `sigmx/server` has the same event builders, responses, streams and signal reading as plain Fetch-API code.

## How it works

Attributes are `data-<plugin>[:key][__modifier.arg]="expression"`. Expressions are plain JavaScript in which `$name` is a signal:

```html
<button data-on:click__debounce.300ms="@get('/search')">Search</button>
<li data-class:active="$page === 3"></li>
<input data-bind:user.email />
<p data-text="`${$items.length} items, ${@intl('NumberFormat', $total, { style: 'currency', currency: 'EUR' })}`"></p>
```

State is one JSON-like store addressed by dotted paths and patched with merge-patch semantics: objects merge, `null` removes, arrays notify on `push`. Requests send the store (minus `_`-prefixed paths) and apply whatever comes back, decided by the response's content type:

| the server returns  | sigmx does                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `text/html`         | morphs it into the page: top-level elements by `id`, or a target from the `sigmx-selector` and `sigmx-mode` headers |
| `application/json`  | merges it into the signals                                                                                          |
| `text/event-stream` | applies each event as it arrives: `patch-elements`, `patch-signals`, or your own handlers                           |

The everyday case is the first row: render a partial with whatever templating you already use and return it. The morph keeps every element whose id appears on both sides, so a re-rendered form keeps what the user typed. Streams are there for progress, chat and dashboards, where one request should keep delivering:

```
event: sigmx-patch-signals
data: signals {"progress": 40}

event: sigmx-patch-elements
data: selector #log
data: mode append
data: elements <li>Validating…</li>
```

## The build

The runtime is small because choosing plugins and compiling expressions happens at build time. Like a CSS framework scanning for class names, sigmx scans your source for the directives and functions you use and bundles only those, with an allowlist and support for your own plugins:

```bash
npx sigmx scan src --out src/sigmx-plugins.js
```

```ts
import { createSigmx } from 'sigmx';
import { plugins } from './sigmx-plugins.js';
createSigmx({ plugins });
```

The same scanner is a Vite plugin for any framework (`sigmxAuto` from `sigmx/vite`, serving `virtual:sigmx-plugins`), an option of the Astro integration (`sigmx({ plugins: 'auto' })`) and part of the Rust crate for projects without Node. Precompilation goes one step further and ships every expression as a real function (`sigmxPrecompile`, or `precompile: true` in Astro), so `new Function` leaves the bundle. The docs site's "Build tooling" section covers all of it.

## Any server, any language

Nothing on the server needs JavaScript. A backend speaks sigmx by returning HTML with the same ids as the page, JSON to merge into signals, or a text event stream of `event:` and `data:` lines, and any language that can write an HTTP response can do that. `sigmx/server` and the Astro, Hono and Rust SDKs only save you the formatting.

## Plugins

| kind      | plugins                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| state     | `signals` `computed` `effect` `ref` `persist` `query-string`                                                   |
| rendering | `text` `html` `show` `class` `style` `attr` `animate` `transition` `collapse` `cloak`                          |
| forms     | `bind` `custom-validity` `mask`                                                                                |
| events    | `on` `init` `on-interval` `on-intersect` `on-resize` `on-raf` `on-signal-patch` `match-media`                  |
| layout    | `teleport` `scroll-into-view` `remove-me`                                                                      |
| server    | `@get` `@post` `@put` `@patch` `@delete` `@ws` `boost` `indicator` `patch-elements` `patch-signals`            |
| utilities | `@peek` `@setAll` `@toggleAll` `@fit` `@clipboard` `@intl` `@dispatch` `@confirm` `json-signals` `replace-url` |

Every plugin has a page in the docs with a live example and its measured size.

## Writing a plugin

```ts
import { attribute } from 'sigmx';

export const upper = attribute({
  name: 'upper',
  value: 'required',
  mount({ el, evaluate, effect }) {
    effect(() => {
      el.textContent = String(evaluate()).toUpperCase();
    });
  },
});
```

Plugins are plain objects; nothing registers on import. The mount context gives you `evaluate`, `effect`, `listen`, `cleanup`, the store and the runtime, and everything registered through it is torn down when the attribute or element goes away. Functions (`@name()`) and server-event handlers work the same way with `action()` and `handler()`. The docs site's "Extending" section walks through all three and ends with a complete Plausible analytics plugin.

## Sizes

Brotli, measured from the real source by `npm run size` and `npm run compare` (nothing is quoted from memory):

|                                                             |  brotli |
| ----------------------------------------------------------- | ------: |
| sigmx core                                                  |  4.5 KB |
| sigmx core, precompiled expressions                         |  3.8 KB |
| sigmx essentials (state, rendering, forms, requests, morph) |  9.0 KB |
| sigmx everything, 50 plugins                                | 11.5 KB |
| htmx 2.0.10                                                 | 14.6 KB |
| Datastar 1.0.3 (23 plugins)                                 | 11.8 KB |
| Alpine.js 3.17.1                                            | 17.6 KB |

## Documentation

The full documentation, guides, the build tooling and extending sections, and live examples with their server code live in [`website/`](website), built with Astro and Starlight:

```bash
cd website && npm install && npm run dev
```

## Repository

```
src/kernel/        reactive graph, store, expression compiler, runtime, scanner, precompiler (DOM-free core)
src/server.ts      sigmx/server: event builders, sse/sseStream/html/json responses, readSignals
src/plugins/       directives, functions, server-event handlers, the morph
src/presets/       minimal, essentials, all
src/vite.ts        sigmx/vite: sigmxAuto and sigmxPrecompile plugins; src/cli.ts is `npx sigmx scan`
sdks/astro/        @sigmx/astro: integration, server helpers, auto mode, precompilation
sdks/hono/         @sigmx/hono: middleware with signals(), html(), events(), stream(); serveClient()
sdks/rust/         sigmx crate: axum and Workers integrations, embedded client, the scanner in Rust
examples/          standalone Vite, Express, Hono and Astro projects using the published packages
website/           documentation site
scripts/           build, size and comparison measurements, dev server
tests/             unit (node:test), dom (happy-dom) and browser (Playwright) suites
```

```bash
npm install
npm run check    # type-check
npm run lint     # biome: formatting and lint rules
npm run format   # biome: rewrite files in the house style
npm test         # build, then unit tests and happy-dom tests for every plugin
npm run test:browser  # Playwright: transitions, observers, WebSocket, the standalone build
npm run test:all # everything above plus the SDK suites
cd sdks/rust && cargo test --all-features   # the Rust SDK (after npm run build, which embeds the client)
npm run dev      # dev server with SSE and WebSocket endpoints; open /tests/browser/index.html
npm run size     # bundle sizes for representative plugin sets
npm run compare  # sizes of htmx, Datastar and Alpine at pinned versions
```

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Open an issue first for anything larger than a fix, keep plugins as small as their reference-page size table suggests, and run `npm run lint` and both test suites before a pull request.

## Licence

[MIT](LICENSE). sigmx is an independent implementation: its attribute syntax is compatible with Datastar's public API so that markup can be migrated, and it contains no Datastar code.

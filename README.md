# sigmx

**htmx on steroids, in a runtime smaller than htmx.**

> **Status: an experiment.** sigmx is a personal exploration of what a hypermedia library looks like when it starts from a tiny, plugin-based core. It is inspired by [htmx](https://htmx.org) (the server sends HTML, the browser swaps it in), [Alpine.js](https://alpinejs.dev) (declarative `data-*` attributes with a little reactivity) and [Datastar](https://data-star.dev) (which fused the two and whose attribute syntax sigmx keeps for compatibility). The code is original, the APIs may still change, and it has not been used in production. Try it, break it, and open an issue with what you find.

Your server renders HTML, as it always has. The browser asks for more of it with `@get` and `@post`, and sigmx merges the response into the page with a morph that keeps focus, typed input and scroll position. When you want live updates, the same request can return a stream of patches instead. Signals, two-way binding and reactive attributes cover the client-side state. You write `data-*` attributes and register only the plugins you use.

- **Tiny.** 4.0 KB core, 8.9 KB with the essentials, 12.0 KB with all 52 plugins (brotli). Zero runtime dependencies.
- **Server-driven.** Return plain HTML from any endpoint and it is morphed into the page by id, or targeted with a header. Return JSON to merge signals, or an event stream to push many patches over one request, with `Last-Event-ID` reconnects.
- **Reactive where it matters.** Signals declared in markup; `bind`, `show`, `class`, computed values and effects keep the page in step. No component model, no virtual DOM.
- **Pay for what you use.** Every directive and function is an opt-in plugin, and auto mode scans your source to bundle exactly the set it finds.
- **Batteries from the ecosystem.** The Alpine plugins (`collapse`, `mask`, `trap`, `teleport`, …) and htmx extensions (`boost`, `ws`, `remove-me`, …) people bolt on are built in as plugins.
- **Datastar-compatible markup.** Existing Datastar templates run unchanged.

```html
<div data-signals="{ count: 0, name: '' }">
  <input data-bind:name placeholder="Your name">
  <p data-show="$name">Hello, <span data-text="$name"></span>!</p>
  <button data-on:click="$count++">Clicked <b data-text="$count"></b> times</button>
  <button data-on:click="@post('/save')" data-indicator:saving data-attr:disabled="$saving">Save</button>
</div>
```

## Install

```bash
npm install sigmx
```

```ts
import { createSigmx } from 'sigmx'
import { essentials } from 'sigmx/presets/essentials'

createSigmx({ plugins: essentials })
```

Or pick plugins by hand (`sigmx/plugins` is tree-shakeable), use `sigmx/presets/minimal` or `sigmx/presets/all`, let [auto mode](#auto-mode) choose, or drop in the script-tag build:

```html
<script type="module" src="/sigmx.standalone.js"></script>
```

Astro users: `npm install sigmx @sigmx/astro` and add `sigmx()` to the integrations; see [sdks/astro](sdks/astro). Hono users: `npm install sigmx @sigmx/hono`, then `app.use(sigmx())` gives every handler `c.var.sigmx`; see [sdks/hono](sdks/hono). Everyone else: `sigmx/server` has the same event builders, responses, streams and signal reading as plain Fetch-API code.

## How it works

Attributes are `data-<plugin>[:key][__modifier.arg]="expression"`. Expressions are plain JavaScript in which `$name` is a signal:

```html
<button data-on:click__debounce.300ms="@get('/search')">Search</button>
<li data-class:active="$page === 3"></li>
<input data-bind:user.email>
<p data-text="`${$items.length} items, ${@intl('number', $total, { style: 'currency', currency: 'EUR' })}`"></p>
```

State is one JSON-like store addressed by dotted paths and patched with merge-patch semantics: objects merge, `null` removes, arrays notify on `push`. Requests send the store (minus `_`-prefixed paths) and apply whatever comes back, decided by the response's content type:

| the server returns | sigmx does |
|---|---|
| `text/html` | morphs it into the page: top-level elements by `id`, or a target from the `sigmx-selector` and `sigmx-mode` headers |
| `application/json` | merges it into the signals |
| `text/event-stream` | applies each event as it arrives: `patch-elements`, `patch-signals`, or your own handlers |

The everyday case is the first row: render a partial with whatever templating you already use and return it. The morph keeps every element whose id appears on both sides, so a re-rendered form keeps what the user typed. Streams are there for progress, chat and dashboards, where one request should keep delivering:

```
event: sigmx-patch-signals
data: signals {"progress": 40}

event: sigmx-patch-elements
data: selector #log
data: mode append
data: elements <li>Validating…</li>
```

## Plugins

| kind | plugins |
|---|---|
| state | `signals` `computed` `effect` `ref` `persist` `query-string` |
| rendering | `text` `html` `show` `class` `style` `attr` `animate` `transition` `collapse` `view-transition` `cloak` |
| forms | `bind` `custom-validity` `mask` |
| events | `on` `init` `on-interval` `on-intersect` `on-resize` `on-raf` `on-signal-patch` `match-media` |
| layout | `teleport` `trap` `scroll-into-view` `remove-me` |
| server | `@get` `@post` `@put` `@patch` `@delete` `@ws` `boost` `indicator` `patch-elements` `patch-signals` |
| utilities | `@peek` `@setAll` `@toggleAll` `@fit` `@clipboard` `@intl` `@dispatch` `@confirm` `json-signals` `replace-url` |

Every plugin has a page in the docs with a live example and its measured size.

## Sizes

Brotli, measured from the real source by `npm run size` and `npm run compare` (nothing is quoted from memory):

| | brotli |
|---|---:|
| sigmx core | 4.0 KB |
| sigmx essentials (state, rendering, forms, requests, morph) | 8.9 KB |
| sigmx everything, 52 plugins | 12.0 KB |
| htmx 2.0.10 | 14.6 KB |
| Datastar 1.0.3, free bundle (23 plugins) | 11.8 KB |
| Alpine.js 3.17.1 | 17.6 KB |

Precompiling expressions at build time removes the runtime compiler and any use of `new Function`, taking the core to 3.6 KB and making strict CSP trivial.

## Auto mode

Like a CSS framework scanning for class names, sigmx can scan your source for the directives and functions you use and bundle only those, with an allowlist and support for your own plugins:

```js
// vite.config.js
import { sigmxAuto } from 'sigmx/vite'
export default { plugins: [sigmxAuto({ always: ['signals'], custom: { upper: 'src/plugins/upper.ts' } })] }
```

```ts
import { createSigmx } from 'sigmx'
import { plugins } from 'virtual:sigmx-plugins'
createSigmx({ plugins })
```

Without Vite: `npx sigmx scan src --out src/sigmx-plugins.js`. In Astro: `sigmx({ plugins: 'auto' })`.

## Writing a plugin

```ts
import { attribute } from 'sigmx'

export const upper = attribute({
  name: 'upper',
  value: 'required',
  mount({ el, evaluate, effect }) {
    effect(() => { el.textContent = String(evaluate()).toUpperCase() })
  },
})
```

Plugins are plain objects; nothing registers on import. The mount context gives you `evaluate`, `effect`, `listen`, `cleanup`, the store and the runtime, and everything registered through it is torn down when the attribute or element goes away. Functions (`@name()`) and server-event handlers work the same way with `action()` and `handler()`.

## Documentation

The full documentation, guides and live examples live in [`website/`](website), built with Astro and Starlight:

```bash
cd website && npm install && npm run dev
```

## Repository

```
src/kernel/        reactive graph, store, expression compiler, runtime (DOM-free core)
src/server.ts      sigmx/server: event builders, sse/sseStream/html/json responses, readSignals
src/plugins/       directives, functions, server-event handlers, the morph
src/presets/       minimal, essentials, all
sdks/astro/        @sigmx/astro: integration, server helpers, auto mode, precompilation
sdks/hono/         @sigmx/hono: middleware with signals(), html(), events(), stream(); serveClient()
examples/          standalone Vite, Express, Hono and Astro projects using the published packages
website/           documentation site
scripts/           build, size and comparison measurements, dev server
tests/             node:test suite for the core; browser suite under tests/browser
```

```bash
npm install
npm run check    # type-check
npm run lint     # biome: formatting and lint rules
npm run format   # biome: rewrite files in the house style
npm test         # build, then node:test over the DOM-free core
npm run dev      # dev server with SSE and WebSocket endpoints; open /tests/browser/index.html
npm run size     # bundle sizes for representative plugin sets
npm run compare  # sizes of htmx, Datastar and Alpine at pinned versions
```

Contributions are welcome. Open an issue first for anything larger than a fix, keep plugins as small as their reference-page size table suggests, and run `npm run lint` and both test suites before a pull request.

## Licence

[MIT](LICENSE). sigmx is an independent implementation: its attribute syntax is compatible with Datastar's public API so that markup can be migrated, and it contains no Datastar code.

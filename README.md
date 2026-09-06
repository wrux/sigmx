# sigmx

htmx on steroids, in a runtime smaller than htmx. Your server renders HTML and streams patches; the browser reacts with signals, two-way binding and a morph that keeps focus, typed input and scroll position. You write `data-*` attributes and register only the plugins you use. Fully TypeScript, **zero runtime dependencies**, and a DOM-free core you can unit test in Node.

Brotli-compressed: 4.0 KB core, 8.9 KB with the essentials (state, rendering, forms, requests, morph), 12.0 KB with all fifty-two plugins, against 14.6 KB for htmx 2.0.10 and 11.8 KB for Datastar 1.0.3's free bundle (23 plugins). `npm run size` and `npm run compare` regenerate every figure.

```html
<div data-signals="{ count: 0 }">
  <button data-on:click="$count++">+1</button>
  <span data-text="$count"></span>
  <p data-show="$count > 2">You clicked more than twice.</p>
</div>
```

```ts
import { createSigmx } from 'sigmx'
import { signals, text, on, show } from 'sigmx/plugins'

createSigmx({ plugins: [signals, text, on, show] })
```

Status: feature-complete against the reference library, including its paid tier: core, 33 directives and functions, a streaming fetch client, server-event handlers with id-aware DOM morphing, and `animate`. Full documentation, guides and live examples live in the `website/` project.

## Sizes

Minified and gzipped, measured by `npm run size`:

| what you register                              |  gzip |
|------------------------------------------------|------:|
| core only                                      | 4.5 KB |
| core with precompiled expressions              | 4.0 KB |
| `minimal` preset (signals, text, show, on)     | 5.2 KB |
| minimal + fetch client + server handlers       | 8.9 KB |
| every plugin, bundled by your own tool         | 14.1 KB |
| every plugin, shipped `dist/sigmx.standalone.js` | 13.4 KB |

The standalone file is passed through terser after esbuild, which is worth about 5% gzipped; your own bundler decides for everything else. `npm run size` prints the current numbers.

## Options

```ts
createSigmx({
  plugins: [...],                    // nothing registers implicitly
  prefix: ['data-', 'hx-', 's-'],    // attribute prefixes to scan; default 'data-'
  compile: cspCompiler(nonce),       // from 'sigmx/csp', for strict CSP pages
  onError: (err, { plugin, el, attr }) => {},  // default console.error; one bad attribute never stops the scan
  store: otherInstance.store,        // share signals between instances
  autoStart: true,                   // scan document on DOM ready
})
```

The instance exposes `store`, `$` (the root proxy, so `sigmx.$.count++` works from JavaScript), `apply(root)`, `use(...plugins)` and `destroy()`.

Expressions compile in the browser by default. With a build step they can be precompiled into a function table instead (`createRuntime({ plugins, expressions: precompiled(table) })`, or `sigmx({ precompile: true })` in Astro), which removes the runtime compiler from the bundle and any use of `new Function`. `sigmx/precompile` provides the Node-side scanner and generator.

## Expressions

Attribute values are JavaScript. Signals are referenced with `$`: `$count`, `$user.name`, `$['odd-key']`, or `$` for the whole store. Assignment and mutation just work (`$count++`, `$items.push(x)`, `$user = { name: 'a' }`). Multiple statements are allowed and the last one is the value: `$a = 1; $a * 2`. `el` and `evt` are in scope. Actions are called as `@name(...)`. Compiled functions are cached by source, so a thousand rows with the same expression compile once.

## Attribute syntax

`data-<plugin>[:key][__modifier[.arg]...]="expression"`

- `data-on:click__debounce.300ms__prevent="…"`
- `data-signals:user.name__ifmissing="'anon'"`
- `data-class:is-active="$active"`

Keys are recased to camelCase for signal names unless `__case.kebab|snake|pascal` says otherwise. Attributes mount in document order; declare persisted or URL-synced signals with `__ifmissing`.

## Plugins

Attributes: `signals`, `computed`, `effect`, `ref`, `text`, `show`, `class`, `style`, `attr`, `bind`, `init`, `on`, `on-interval`, `on-intersect`, `on-signal-patch`, `json-signals`, `indicator`, `on-resize`, `on-raf`, `match-media`, `scroll-into-view`, `custom-validity`, `persist`, `query-string`, `replace-url`, `view-transition`.

Attributes (continued): `animate`, and the ecosystem set: `cloak`, `collapse`, `transition`, `mask`, `trap`, `teleport`, `html`, `remove-me`, `boost`.

Actions: `@get`, `@post`, `@put`, `@patch`, `@delete`, `@peek`, `@setAll`, `@toggleAll`, `@fit`, `@clipboard`, `@intl`, `@dispatch`, `@confirm`, `@ws`.

Server-event handlers: `patch-signals`, `patch-elements` (with `morph` and `morphInner` exported for direct use).

Presets: `sigmx/presets/minimal`, `sigmx/presets/all`. Script tag: `sigmx/standalone` (or `dist/sigmx.standalone.js`).

Events on `document`: `sigmx-ready`, `sigmx-signal-patch` (detail is the nested patch, `null` for removals), `sigmx-fetch` (`started`, `finished`, `error`, `retrying`), `sigmx-server-event` (every named event from a stream).

## Talking to a server

```html
<button data-on:click="@post('/save')">Save</button>
<form data-on:submit="@post('/signup', { contentType: 'form' })">…</form>
<div data-indicator:saving></div>   <!-- true while a request from this element or anything inside it is in flight -->
```

Requests send the signals as JSON (GET puts them in the `sigmx` query parameter; paths starting with `_` are excluded by default) with `Accept: text/event-stream, text/html, application/json` and a `Sigmx-Request: true` header. The response decides what happens:

- `text/event-stream`: each event is routed by name to a handler. `sigmx-patch-signals` carries `signals {json}` (plus `onlyIfMissing true`); `sigmx-patch-elements` carries `elements <html>`, `selector`, `mode` (`outer` default, `inner`, `replace`, `prepend`, `append`, `before`, `after`, `remove`) and `useViewTransition`. Data lines are `key value`, repeated keys join with newlines, and `id:`/`retry:` are honoured on reconnect.
- `text/html`: patched as elements; `sigmx-selector` and `sigmx-mode` response headers set the target.
- `application/json`: merged as signals.
- `text/javascript`: executed.

Options: `headers`, `contentType`, `selector`, `filter`, `payload`, `abort` (`'replace'` cancels an earlier request with the same method and URL), `openWhenHidden`, `reconnect`, `retry: { attempts, interval, factor, max, onStatusError }`.

Migrating from a backend that emits `datastar-*` event names: `createSigmx({ eventPrefix: ['sigmx-', 'datastar-'] })`.

Morphing keeps elements whose `id` appears in both trees, so focus, typed input values and scroll positions survive. Live form state is only overwritten when the server's `value`/`checked`/`selected` *attribute* changed. Mark a subtree `data-ignore-morph` to skip it, or list attributes to keep in `data-preserve-attr="class style"`.

## Writing a plugin

```ts
import { attribute } from 'sigmx'

export const upper = attribute({
  name: 'upper',
  key: 'forbidden',
  value: 'required',
  mount({ el, evaluate, effect }) {
    effect(() => { el.textContent = String(evaluate()).toUpperCase() })
  },
})
```

The context gives you `el`, `key`, `value`, `mods`, `cased()`, `evaluate(evt?, ...args)`, `effect(fn)`, `listen(target, type, fn)`, `cleanup(fn)`, `error(msg)`, `store` and `runtime`. Everything registered through the context is torn down when the attribute or element goes away. Actions get `({ el, evt, store, runtime, error }, ...args)`.

## Documentation and SDKs

- `website/`: the documentation site (Astro + Starlight) with live demos, including streaming ones backed by Astro endpoints. `cd website && npm install && npm run dev`.
- `sdks/astro/`: the `sigmx-astro` integration and server helpers (`readSignals`, `sse`, `sseStream`, `html`, `json`, event builders). `cd sdks/astro && npm test`.

## Scripts

```bash
npm run check   # tsc --noEmit
npm run build   # dist/ (one ESM module per file + .d.ts) and dist/sigmx.auto.js
npm test        # build, then node:test over the DOM-free core
npm run size    # gzip/brotli sizes for representative plugin sets
npm run dev     # zero-dependency dev server with SSE/JSON/HTML test endpoints on :8765
```

`tests/browser/index.html` runs the engine, morph, fetch and animate tests in a real browser, served by `npm run dev`.

## Licence

MIT. sigmx is an independent implementation; its attribute syntax is compatible with Datastar's public API for migration, and it contains no code from Datastar or Datastar Pro.

# sigmx

A small hypermedia library: declarative `data-*` attributes, signals, and a plugin system where you register only what you ship. Fully TypeScript, **zero runtime dependencies**, and a DOM-free core you can unit test in Node.

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

Status: feature-complete against the reference library, including its paid tier: core, 33 directives and functions, a streaming fetch client, server-event handlers with id-aware DOM morphing, and `animate`. See [docs/REVIEW.md](docs/REVIEW.md).

## Sizes

Minified and gzipped, measured by `npm run size`:

| what you register                              |  gzip |
|------------------------------------------------|------:|
| core only                                      | 4.4 KB |
| `minimal` preset (signals, text, show, on)     | 5.1 KB |
| minimal + fetch client + server handlers       | 9.0 KB |
| every plugin (`sigmx/standalone`)              | 12.6 KB |

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

Attributes (continued): `animate`.

Actions: `@get`, `@post`, `@put`, `@patch`, `@delete`, `@peek`, `@setAll`, `@toggleAll`, `@fit`, `@clipboard`, `@intl`.

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

`examples/index.html` is a smoke-test page and `tests/browser/index.html` runs the engine, morph, fetch and animate tests in a real browser; both are served by `npm run dev`.

## Licence

MIT. See [NOTICE.md](NOTICE.md) for provenance.

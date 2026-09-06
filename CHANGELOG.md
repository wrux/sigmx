# Changelog

## Unreleased

**A 9.9 KB "everything" build.** The script-tag bundle with all 52 plugins is 10,119 bytes brotli (was 12,410), the core 3.5 KB (was 4.1 KB) and the essentials 7.4 KB (was 8.8 KB). About a third of that came from rewrites with unchanged behaviour; the rest came from removing options and modifiers, listed below so the release can be judged as a whole. Every plugin still exists.

Rewrites with unchanged behaviour:

- Runtime, store, reactive graph, request client, morph, `bind`, `patch-elements`, `query-string`, `animate`, `trap`, `boost`, `@ws` and `scroll-into-view` restructured for size. The bundler settings were already at their floor.
- `@action(` rewriting uses a regex that skips string literals; `@ws` parses blocks with the same code as event streams (`parseBlock`).
- The morph no longer parks kept elements in a fragment; it holds them by id and moves them where the new tree wants them.
- `trap` finds focusable elements with a short selector plus a JS filter; `match-media` wraps bare `property: value` queries.
- Built-in plugins are declared with compact internal constructors (`src/plugins/def.ts`); `attribute()`, `action()` and `handler()` are unchanged for plugin authors.

Removed (each was measured at 20–150 bytes brotli; revert the matching hunk to bring one back):

- Runtime: attribute key/value contract errors (`needs a key`, `takes no value`), the `sigmx-ready` event, `ignore__self`, the parsed-attribute cache, the `__viewtransition` modifier and `withViewTransition`, the `__delay` modifier (`delay()` stays exported), `recase` styles `snake` and `pascal` (the functions stay exported), string-form `include`/`exclude` filters (pass a RegExp), empty namespaces in `snapshot()`, `delete $.list[i]` notifications (assign instead), the multi-statement "return the last statement" fallback at runtime (the build-time precompiler keeps it), and `Computed.peek()` refreshing.
- Requests: `openWhenHidden` (requests stay open while the tab is hidden), `retry.onStatusError` (status errors are reported, never retried), passing an `AbortController` as `abort`, executing `javascript` responses, the `retrying` fetch event, and the `Sigmx-Use-View-Transition` response header / `useViewTransition` field of `patch-elements`. Form requests respect a caller-supplied `Content-Type`. `patch-elements` no longer validates `mode` or warns about missing targets.
- Morph: live form state is no longer re-synced when a default attribute changes, and `sigmx-prop-change` is gone (typed values survive a morph as before; `data-preserve-attr` and `data-ignore-morph` stay).
- `bind`: `type=file` (base64 file reads), `__prop`. `query-string`: the bare filter form and its `__filter` (the keyed form, including `__history`, stays). `computed`: the object form (use the keyed form). `attr`: objects are no longer serialised as JSON. `style`: falsy values remove the property instead of restoring the original inline value.
- Modifiers: `on` `__capture`/`__passive`; `on-intersect` `__full`/`__half` (`__threshold.N` stays); `on-signal-patch:key` filtering; `on-interval` `.leading`; `trap__inert`; `transition` `__scale`/`__origin` (fade only); `collapse__min`; `animate` `__easing` (eases out) and px→% conversion, CSS properties only; `scroll-into-view` `h*` inline options; `teleport__prepend`; `json-signals__terse`; `persist__session`; `boost__replace`.
- Test suite: `tests/audit/` probes 151 behaviours against any build; `npm run audit` prints a before/after matrix against `main` (or `--ref`), and `tests/audit/features.test.mjs` pins which probes must pass and which are removed.
- `@intl` takes the `Intl` constructor name: `@intl('NumberFormat', …)` instead of `'number'`. `@ws` ignores blocks without `data` lines.

## 0.1.1 (2026-09-06)

`sigmx` 0.1.1, `@sigmx/astro` 0.1.1, `@sigmx/hono` 0.1.1. The SDKs require `sigmx` 0.1.1 or later.

- `sigmx/server`: the event builders, `sse`, `sseStream`, `html`, `json`, `readSignals` and `validateSignals` live in the core package as plain Fetch-API code; `@sigmx/astro/server` re-exports them. Markup helpers accept anything with a `toString()`, such as JSX nodes and `html` templates.
- `@sigmx/hono` (new): middleware giving handlers `c.var.sigmx` with `signals()` (Standard Schema validation, `SignalsError` as an `HTTPException`), `html()`, `json()`, `events()` and `stream()` on Hono's `streamSSE`; `serveClient()` in `@sigmx/hono/node` serves the script-tag build from `node_modules` with an ETag. The 0.1.0 published earlier the same day declared a peer range that admitted `sigmx` 0.1.0, which lacks `sigmx/server`; it is deprecated.
- Runtime fixes found by the new test suite: async action failures reach `onError` instead of being unhandled rejections, a detected effect loop no longer poisons later flushes, `contentType: 'form'` with a `selector` works from a button outside the form, elements are recognised by node type so the runtime also runs in simulated DOMs, and a subtree reported twice by the observer is mounted once.
- The build cleans `dist` first; 0.1.0 shipped stale pre-rewrite files.
- Test suite in four layers (unit, happy-dom with one file per plugin, Playwright browser, SDKs) and a GitHub Actions workflow covering lint, type-check, tests, size, the docs build and the example apps.
- Examples under `examples/` for Vite, Express, Hono (rendered with Hono JSX) and Astro, styled with Tailwind. Biome formatting and lint across the repository.

## 0.1.0

First release.

- Kernel: versioned reactive graph, path-keyed signal store with JSON merge-patch semantics, expressions evaluated as plain JavaScript with optional build-time precompilation, per-attribute error isolation, configurable attribute and event prefixes.
- 52 opt-in plugins: directives, `@` functions, server-event handlers with an id-aware morph, a streaming fetch client, and the Alpine and htmx ecosystem equivalents.
- Auto mode (`sigmx/vite`, `npx sigmx scan`) that bundles only the plugins your source uses.
- `@sigmx/astro`: integration with `plugins: 'auto'` and `precompile`, plus server helpers for reading signals and streaming patches.

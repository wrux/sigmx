# Review: from a Datastar port to an independent codebase

Date: 2026-09-06. Upstream reference: starfederation/datastar v1.0.3.

## Where the spike stood

The first spike proved the packaging idea (explicit registration, tree-shakeable plugins, zero dependencies) but most of its code was copied from upstream under MIT: the signals module verbatim, the expression regexes verbatim, the utils, and the free plugins with only mechanical edits. That is legal with attribution, but it is not a distinct project, and it inherited upstream's design limits.

## What was rewritten and why it is better

| area | upstream design | sigmx design | benefit |
|---|---|---|---|
| reactivity | alien-signals port: doubly linked dependency lists, six bit flags, ~600 lines | versioned push/pull graph, ~190 lines: signals bump a version, effects re-run only if a dependency's version moved | a computed that recomputes to an equal value stops the cascade; nested effects are owned and disposed; errors inside effects are reported per attribute instead of unwinding the flush |
| signal store | every leaf is a signal inside nested Proxies; reading an unknown name **creates** an empty-string signal and fires a patch event; arrays need special-cased `length` handling | flat `Map<path, Signal>` with JSON merge-patch (RFC 7396) semantics; unknown reads return `undefined` and subscribe to the store's shape so they re-run when the path appears; arrays notify on `push`/`splice` via a proxy; computeds are first-class leaves that patches skip | no phantom signals, predictable patch events, per-instance stores that can also be shared, `JSON.stringify($)` just works |
| expressions | regex rewriting of `$name` into `$['name']` plus a regex statement splitter, compiled once per element | code runs inside `with (scope)` over a proxy, so `$count++`, `$user.name`, `$['a-b']` are plain JavaScript; a 40-line scanner rewrites only `@action(` and splits statements, skipping strings and comments; compiled functions are cached by source | fewer parsing edge cases, and identical expressions across many elements compile once |
| engine | plugins self-register on import through a `setTimeout` queue; a throwing plugin aborts the DOM scan; aliasing and CSP are build-time defines | `createSigmx()` instance; plugins are values; per-attribute try/catch with an `onError` hook; `prefix` and `compile` are options; `ctx.effect`, `ctx.listen`, `ctx.cleanup` tear down automatically | tree-shaking, SSR-safe imports, migration-friendly prefixes, plugins are a few lines each |
| requirements | `must` / `denied` / `exclusive` matrix with typed conditional contexts | `key` and `value` are `'required'` or `'forbidden'`; plugins that accept either form check themselves | simpler types, same guarantees |
| bind | index-based binding for checkbox groups | checkbox groups bind to an array of values; radios, `select multiple`, files (base64), custom elements via `__prop` | cleaner data model for forms |
| Pro features | commercial licence | all reimplemented from the public docs, including `query-string` with `__history` | no paywall |

Names are also distinct: package `sigmx`, factory `createSigmx`, events `sigmx-*`. No string in `src/` mentions the upstream project.

## Measured sizes

| bundle | raw | gzip | brotli |
|---|---:|---:|---:|
| upstream datastar.js (free plugins only) | 33 538 | 13 367 | 12 100 |
| sigmx core only | 9 739 | 4 415 | 4 043 |
| sigmx minimal preset (signals, text, show, on) | 11 604 | 5 149 | 4 672 |
| sigmx, the 17 plugins that match upstream's free set | 14 482 | 6 058 | 5 517 |
| upstream, those same 17 plugins | 21 993 | 9 346 | 8 441 |
| sigmx, every plugin including bind, query-string and the former Pro set | 21 199 | 8 479 | 7 752 |

The full-parity projection (adding the streaming fetch client and DOM morph, roughly 4.5 KB gzip together) is about 13 KB gzip with every feature, against upstream's 13.4 KB without Pro.

## Verified

- `npm test`: 13 tests over signals, store and expression compiler pass in plain Node with no DOM.
- Browser smoke test: signals, text, on, show, class, computed, bind (text, range, checkbox group), fit, intl, match-media, on-resize, on-raf, persist across reload, `hx-` and `s-` prefixes, `s-ignore`.
- One real-world case surfaced during testing and is now covered by a test: a stored snapshot containing a computed key must not abort the merge.

## Completed since the rewrite

- **File layout** no longer mirrors upstream: `kernel/` (reactive, state, compile, runtime, strict-csp, contracts), `lib/` (objects, casing, schedule, sse), `plugins/directives`, `plugins/functions`, `plugins/server-events`, `standalone.ts`.
- **Streaming fetch client** (`@get` … `@delete`): a 40-line SSE reader, `key value` payload fields, `Last-Event-ID` and `retry:` support, exponential backoff, per-URL request replacement, abort on element teardown via the new `ActionCtx.cleanup`, pause-and-resume when the tab is hidden, and `sigmx-fetch` / `sigmx-server-event` lifecycle events. Responses are routed by content type: event streams, HTML, JSON and JavaScript.
- **Server-event handlers** `patch-signals` and `patch-elements`, routed through `runtime.handle()` which strips any accepted `eventPrefix`, so a backend still emitting `datastar-*` names works during migration.
- **Id-aware morph**, written from first principles: persistent-id set computed up front, a pantry fragment for elements that move across ancestors, `moveBefore` when available, attribute-based (not live-value-based) form-state updates, `preserve-attr` and `ignore-morph`, script activation for inserted nodes, full-document responses.
- **`animate`**: tweens numeric CSS properties or attributes toward the expression's value with duration and easing modifiers, retargets mid-flight, honours `prefers-reduced-motion`.
- **Verification**: a dependency-free dev server (`scripts/dev.mjs`) with SSE, JSON, HTML and form endpoints, and `tests/browser/index.html` running twelve browser tests (engine mount/unmount and error isolation, five morph scenarios, five fetch scenarios including the legacy prefix and status errors, animate).

Sizes after these additions: minimal + fetch + handlers 9.0 KB gzip; every plugin 12.6 KB gzip, under the reference library's 13.4 KB that excludes its paid features.

## Still open

1. A DOM test layer for Node (`happy-dom`) if you want plugin tests outside a browser; today the browser page covers them.
2. Publish `0.1.0` under the `sigmx` name.

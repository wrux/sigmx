---
title: Stability and compatibility
description: What sigmx promises to keep working, how changes are made, and how that promise is tested.
sidebar: { order: 90 }
---

sigmx is meant to be a dependency you can leave alone for years. This page says exactly what that means.

## What is stable

These surfaces follow semantic versioning: they only change in a major release, with a migration note.

| surface | examples |
|---|---|
| Attribute syntax | `data-<plugin>:<key>__<modifier>.<arg>="expression"`, the configurable prefix, `data-ignore` |
| The 50 built-in plugins | their names, keys, values, modifiers and behaviour as documented in the reference |
| Expression semantics | `$name` paths, `$` for the root, `@action()` calls, `el` and `evt` in scope, statements versus a returned value |
| The store | dotted paths, merge-patch semantics, `null` removes, arrays are reactive in place, computeds are read-only |
| The wire protocol | `Sigmx-Request` and `Accept` headers, signals in the `sigmx` query parameter or JSON body, event-stream blocks (`event:` / `data: key value`), `patch-elements` and `patch-signals` fields, the `Sigmx-Selector`, `Sigmx-Mode` and `Sigmx-Only-If-Missing` response headers |
| Browser events | `sigmx-fetch`, `sigmx-server-event`, `sigmx-signal-patch`, `sigmx-prop-change` and their `detail` shapes |
| Package exports | `sigmx`, `sigmx/plugins`, `sigmx/presets/*`, `sigmx/standalone`, `sigmx/server`, `sigmx/csp`, `sigmx/precompile`, `sigmx/scan`, `sigmx/vite` and the types they export |
| The plugin API | `attribute()`, `action()`, `handler()` and the `Ctx` / `ActionCtx` / `Runtime` objects they receive |

Anything else is internal: module paths under `dist/` other than the exports above, properties prefixed with `_`, the compact plugin constructors in `src/plugins/def.ts`, class internals of `Signal` and `Computed`, and the exact bytes of the bundle.

## How changes are made

- **Additions** (a new plugin, modifier, option or event field) are minor releases. Existing markup keeps working.
- **Behaviour fixes** that change observable results are called out in the CHANGELOG under "Changed", even when the old behaviour was a bug.
- **Removals** happen only in a major release and are first deprecated for at least one minor release, during which the old form still works and logs nothing in production.
- **Bundle size** is a feature, not a promise: every release records it in the CHANGELOG (11.5 KB brotli for the `everything` build with all 50 plugins at the time of writing), and a change that costs bytes is weighed against what it buys, correctness first.

## How the promise is tested

- `npm test` runs the unit suite, one happy-dom test file per plugin, and the **feature audit**: 148 behavioural probes written against the public API, each flagged as expected to pass or expected to be absent. A feature disappearing by accident fails the build.
- `npm run audit` runs the same probes against any earlier build (`main` by default, or `--ref v0.1.1`) and prints a before/after matrix, so a release can state exactly which behaviours changed.
- `npm run test:browser` exercises the shipped standalone in Chromium, including morphing, streams and the boost navigation, and `npm run test:sdks` covers the Astro and Hono packages.
- Every reference page's live demos are loaded from the built documentation site in a real browser as part of the docs check.

## Runtime requirements

The client needs a browser with ES2022, `Proxy`, `MutationObserver`, `fetch` with `ReadableStream`, `AbortSignal.any` and `CSS.escape`: Chrome and Edge 116+, Firefox 124+, Safari 17.4+. Optional APIs degrade quietly: without the Web Animations API `data-transition` switches display instantly, without `moveBefore` moved elements are re-inserted, without `localStorage` `data-persist` keeps state in memory. The server helpers need any runtime with the Fetch API (Node 20+, Deno, Bun, Cloudflare Workers).

## Rules, settled

These were the open design questions before 1.0; each is now a rule with a mechanism behind it.

- **One expression pipeline.** Runtime and precompiler run the same `transform()` and compile the same strict-mode bodies, so an expression means one thing everywhere. Typos throw; a misspelt signal reads as `undefined`.
- **Keys are paths.** A dot in an object key means nesting: `merge({ 'a.b': 1 })` creates `a` → `b`.
- **`_` is the browser-only prefix.** Requests leave `_`-prefixed paths out, and recasing keeps the underscore.
- **Objects are namespaces, arrays are leaves.** `$list` is reactive in place; `$user` is a proxy over paths.
- **Keys are kebab-case in markup.** HTML lowercases attribute names; the build lints `data-bind:firstName` and the runtime camelCases `first-name`.
- **Literal values are declared.** A directive whose value is text sets `literal: true` and gains `__dynamic` for free; everything else is an expression.
- **Plugin arguments are append-only.** Precompiled tables are keyed by source text alone and stay valid across upgrades.

## Failure policy

Expressions and plugins fail one attribute at a time: an error in one `data-text` is reported through `onError` (the console by default) with the plugin name and element, and everything else on the page keeps running. Requests announce failures as `sigmx-fetch` events with `type: 'error'` and never throw into the page. Server patches that cannot be applied, such as an unknown mode, are reported once and are not retried. Corrupted storage, blocked clipboard access and missing optional APIs are handled where they occur.

# Contributing to sigmx

Thanks for helping. This page covers the setup, the rules the test suite enforces, and what a pull request needs.

## Setup

```bash
npm install
npm run build        # one ESM module per source file plus .d.ts, the standalone bundle, and the client the Rust crate embeds
npm test             # builds, then runs the unit, DOM and audit layers
```

The test suite has five layers; run the one you are working in.

| command | covers |
|---|---|
| `npm run test:unit` | the reactive graph, store, compiler, precompiler, scanner, `sigmx/server` and the helper libraries, with no DOM |
| `npm run test:dom` | every plugin, the morph, the request client with a mocked `fetch`, and the runtime, under happy-dom |
| `npm run test:audit` | the feature audit: `tests/audit/probes.mjs` against the built `dist`, with `tests/audit/features.test.mjs` pinning which probes must pass and which are flagged as removed |
| `npm run test:browser` | Playwright in headless Chromium for what a simulated DOM cannot do (needs `npx playwright install chromium` once) |
| `npm run test:sdks` | the Astro integration and the Hono middleware |

`npm run test:all` runs everything. `npm run check` type-checks, `npm run lint` runs Biome and `npm run format` fixes formatting: two-space indentation, single quotes, semicolons, trailing commas, run from the repository root. `npm run dev` starts the dev server the browser layer uses (`http://localhost:8765`). The Rust SDK in `sdks/rust` has its own suite: `cargo test --all-features`, plus `cargo fmt --all --check` and `cargo clippy --all-features --all-targets -- -D warnings`, after `npm run build` has written the embedded client.

## Where things live

```
src/kernel/      the reactive graph, store, expression compiler and runtime (no plugins)
src/plugins/     directives/, functions/ and server-events/, one file per plugin
src/presets/     minimal, essentials, all
src/server.ts    the Fetch-API server helpers
sdks/            @sigmx/astro, @sigmx/hono and the Rust crate
tests/           unit/, dom/, audit/, browser/
website/         the documentation site (Astro and Starlight)
```

Every file under `src/plugins` needs a DOM test of the same name under `tests/dom/directives`, `tests/dom/functions` or `tests/dom/server-events`; `tests/dom/every-plugin.test.mjs` fails when one is missing. The DOM helper in `tests/dom/helpers.mjs` creates an instance, collects everything reported through `onError` and tears down after each test; `mockFetch` and the response builders cover the request client.

## Writing a plugin

- A plugin is a plain object built with `attribute()`, `action()` or `handler()` from the kernel (the built-ins use the compact constructors in `src/plugins/def.ts`). Values are plain data: no classes, no closures over module state.
- No module side effects. A plugin module only exports; nothing runs at import time, so `sideEffects` in `package.json` stays limited to the standalone and CLI entries and bundlers can drop what is not imported.
- Everything a plugin registers goes through its context (`listen`, `effect`, `cleanup`), so the runtime can tear it down when the element or attribute goes away.
- Plugin arguments are append-only: precompiled expression tables are keyed by source text, so a plugin that gains an argument must keep the existing ones in place.
- A directive whose value is text rather than an expression sets `literal: true`; the runtime gives it `__dynamic` for free.

Document the plugin on its reference page under `website/src/content/docs/reference/` with a live demo for each modifier.

## Sizes

Bundle size is recorded, not capped. After a change to `src`, run `npm run size`; it rebuilds the size table in `website/src/data/sizes.json`, and the release notes quote the brotli figures from there. A change that costs bytes is weighed against what it buys, correctness first.

## Changelog

Behaviour changes, additions and removals go under "Unreleased" in `CHANGELOG.md`, in the same voice as the entries already there. A fix that changes an observable result is a changelog entry even when the old behaviour was a bug. Removals also get a `removed` flag on the matching probe in `tests/audit/features.test.mjs`.

## Original code only

sigmx is an independent implementation. Contributions must be your own code: nothing copied or adapted from Datastar, htmx, Alpine.js or any other library, whatever its licence. Documented behaviour and public wire formats may be matched for compatibility; the code that implements them is written here from scratch.

## Pull requests

- One change per pull request, with tests in the layer that can observe it.
- `npm run lint`, `npm run check` and `npm test` pass locally.
- The CHANGELOG entry is written and, if `src` changed, the sizes are recorded.
- British English in prose and documentation, and no mention of any product's paid tiers.

CI runs lint, type-check, every test layer, the size script, the SDK suites, the Rust crate, the docs build and the example apps on each push and pull request.

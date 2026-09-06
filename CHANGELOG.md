# Changelog

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

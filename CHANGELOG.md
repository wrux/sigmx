# Changelog

## Unreleased

- `sigmx/server`: the event builders, `sse`, `sseStream`, `html`, `json`, `readSignals` and `validateSignals` now live in the core package as plain Fetch-API code; `@sigmx/astro/server` re-exports them and `@sigmx/hono` builds on them. Markup helpers accept anything with a `toString()`, such as JSX nodes and `html` templates.
- `@sigmx/hono` 0.1.0: middleware giving handlers `c.var.sigmx` with `signals()` (Standard Schema validation, `SignalsError` as an `HTTPException`), `html()`, `json()`, `events()` and `stream()` on Hono's `streamSSE`; `serveClient()` in `@sigmx/hono/node` serves the script-tag build from `node_modules` with an ETag.
- Examples under `examples/` for Vite, Express, Hono and Astro, installed from npm and styled with Tailwind.
- Biome formatting and lint across the repository; the build cleans `dist` first (0.1.0 shipped stale pre-rewrite files).

## 0.1.0

First release.

- Kernel: versioned reactive graph, path-keyed signal store with JSON merge-patch semantics, expressions evaluated as plain JavaScript with optional build-time precompilation, per-attribute error isolation, configurable attribute and event prefixes.
- 52 opt-in plugins: directives, `@` functions, server-event handlers with an id-aware morph, a streaming fetch client, and the Alpine and htmx ecosystem equivalents.
- Auto mode (`sigmx/vite`, `npx sigmx scan`) that bundles only the plugins your source uses.
- `@sigmx/astro`: integration with `plugins: 'auto'` and `precompile`, plus server helpers for reading signals and streaming patches.

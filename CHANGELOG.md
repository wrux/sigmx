# Changelog

## 0.1.0

First release.

- Kernel: versioned reactive graph, path-keyed signal store with JSON merge-patch semantics, expressions evaluated as plain JavaScript with optional build-time precompilation, per-attribute error isolation, configurable attribute and event prefixes.
- 52 opt-in plugins: directives, `@` functions, server-event handlers with an id-aware morph, a streaming fetch client, and the Alpine and htmx ecosystem equivalents.
- Auto mode (`sigmx/vite`, `npx sigmx scan`) that bundles only the plugins your source uses.
- `@sigmx/astro`: integration with `plugins: 'auto'` and `precompile`, plus server helpers for reading signals and streaming patches.

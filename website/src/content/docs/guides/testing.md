---
title: "Testing and development"
description: "The repository's test suites and dev server."
sidebar: { order: 13 }
---

The kernel's reactive graph, store and expression compiler have no DOM dependency, so they are tested with `node:test` and nothing else:

```bash
npm test          # builds, then runs tests/*.test.mjs in Node
```

Directives, the morph and the request client are exercised in a real browser by `tests/browser/index.html`, served by the repository's dependency-free dev server, which also provides event-stream, JSON, HTML and form endpoints:

```bash
npm run dev       # http://localhost:8765
```

Open `/tests/browser/index.html` (also the server's root) for the suite.

Other scripts: `npm run check` (type-check), `npm run build` (one ESM module per source file plus `.d.ts`, and the standalone bundle), `npm run size` (this site's size tables).

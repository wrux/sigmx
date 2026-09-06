---
title: "Presets and entry points"
description: "Package exports."
sidebar: {"order": 6}
---

| import | contents |
|---|---|
| `sigmx` | `createSigmx`, `createStore`, reactivity primitives, `compile`, plugin helpers, utilities (`camel`, `kebab`, `debounce`, `throttle`, `withTiming`, …) |
| `sigmx/plugins` | every directive, function and handler as named exports, plus `morph` and `morphInner` |
| `sigmx/plugins/directives/<file>` etc. | individual modules |
| `sigmx/presets/minimal` | `[signals, text, show, on]` |
| `sigmx/presets/all` | everything |
| `sigmx/csp` | `cspCompiler(nonce)` |
| `sigmx/standalone` | creates an instance with every plugin and exposes it as `window.sigmx` |
| `dist/sigmx.standalone.js` | the same, minified, for a script tag |

The package is ESM only, ships `.d.ts` files for every module, and declares `sideEffects` for the standalone entry only, so bundlers drop everything you do not import.

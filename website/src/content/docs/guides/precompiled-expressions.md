---
title: "Precompiled expressions"
description: "Compile attribute expressions at build time: a smaller core, no new Function, strict CSP for free."
sidebar: { order: 14 }
---

By default sigmx compiles each attribute expression in the browser with `new Function` the first time it is needed. If your templates are static, a build step can do that work instead: it scans your source for directive attributes, turns every expression into a real function, and ships them as a table. The browser then looks expressions up instead of compiling them.

What you gain:

- the runtime compiler is not bundled: the core drops from 4.5 KB to 4.0 KB gzipped;
- no `new Function` at all, so a strict Content-Security-Policy needs neither `'unsafe-eval'` nor the nonce compiler;
- expressions are syntax-checked at build time, and a broken one fails the build instead of a page.

## With Astro

```js
// astro.config.mjs
import sigmx from '@sigmx/astro'

export default defineConfig({
  integrations: [sigmx({ precompile: true })],
})
```

The integration adds a Vite plugin that scans `src/` (every `.astro`, `.html`, `.mdx`, `.md`, `.ts`, `.tsx`, `.js`, `.jsx`, `.svelte` and `.vue` file) for attributes such as `data-text="$count"` with literal, quoted values, compiles them, and serves the table as the virtual module `virtual:sigmx-expressions`. The injected client uses it through `precompiled(table, fallback)`.

Options: `precompile: { include: ['src', 'content'], extensions: ['.astro'], fallback: false }`.

## The fallback

Expressions the scan cannot see keep working through the runtime compiler: attribute values built at render time (`data-on:click={\`@delete('/x?id=${id}')\`}`), HTML assembled from strings on the server, and markup produced by other scripts. That fallback is on by default and costs the same bytes as today. Set `fallback: false` once every expression is static; from then on an unseen expression throws `expression not precompiled`, which `onError` reports.

## Without Astro

```ts
// build step (Node)
import { extractExpressions, generateTable } from 'sigmx/precompile'
import { all } from 'sigmx/presets/all'

const meta = all.filter((p) => p.type === 'attribute')
const items = extractExpressions(templateSource, meta, ['data-'])
writeFileSync('src/expressions.js', generateTable(items))
```

```ts
// browser
import { createRuntime, precompiled } from 'sigmx'
import { all } from 'sigmx/presets/all'
import { table } from './expressions.js'

createRuntime({ plugins: all, expressions: precompiled(table) })
```

`createRuntime` is `createSigmx` without the default compiler; `createSigmx` is exactly `createRuntime({ ...options, expressions: runtimeExpressions(functionCompiler) })`.

## How expressions change

They do not. The runtime and the build use one pipeline: `transform()` rewrites `$name` into property access on the root store proxy (`$count++` becomes `$.count++`, `$user.name` becomes `$.user.name`, template-literal holes included, strings, comments and regular expressions untouched) and `@name(...)` into a call on the actions object, then the same strict-mode body is compiled. Behaviour, return values and error messages are identical whether an expression was precompiled or compiled in the browser.

Expressions are keyed by their source text alone, so the same text used by two directives compiles once, and a plugin that gains an argument (arguments are only ever appended) keeps tables built before the upgrade valid. Directives whose value is a literal (`mask`, `match-media`, `teleport`, `remove-me`) are skipped unless the attribute carries `__dynamic`. The scan also warns about keyed attributes written with capital letters, such as `data-bind:firstName`, which HTML would lowercase.

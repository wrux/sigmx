---
title: "Precompiled expressions"
description: "Compile attribute expressions at build time: a smaller core, no new Function, strict CSP for free."
sidebar: { order: 2 }
---

By default sigmx compiles each attribute expression in the browser with `new Function` the first time it is needed. If your templates are static, a build step can do that work instead: it scans your source for directive attributes, turns every expression into a real function, and ships them as a table. The browser then looks expressions up instead of compiling them.

What you gain:

- the expression compiler (tokenizer, rewriter, cache) is not bundled: the core drops from 4.5 KB to 3.8 KB brotli (4,659 to 3,910 bytes), and the `examples/astro` build with thirteen plugins ships in 8.2 KB brotli;
- the browser never calls `new Function`, so a strict Content-Security-Policy needs neither `'unsafe-eval'` nor the [nonce compiler](/tooling/csp/);
- expressions are compiled once at build time and shared: the same text used by two directives is one function.

## With Vite (any framework)

```js
// vite.config.js
import { sigmxAuto, sigmxPrecompile } from 'sigmx/vite'

export default { plugins: [sigmxAuto(), sigmxPrecompile()] }
```

```ts
// your entry
import { createRuntime, precompiled } from 'sigmx'
import { plugins } from 'virtual:sigmx-plugins'
import { table } from 'virtual:sigmx-expressions'

createRuntime({ plugins, expressions: precompiled(table) })
```

`sigmxPrecompile` scans `src/` and `index.html` (every `.astro`, `.html`, `.mdx`, `.md`, `.ts`, `.tsx`, `.js`, `.jsx`, `.svelte`, `.vue`, `.php`, `.erb`, `.twig` and `.hbs` file) for attributes such as `data-text="$count"` with literal, quoted values, compiles them, and serves the table as the virtual module `virtual:sigmx-expressions`. Its options (`include`, `extensions`, `prefixes`, `custom`) are on the [Vite plugin](/tooling/vite/) page.

## The fallback

Expressions the scan cannot see keep working through the runtime compiler: attribute values built at render time (`data-on:click={\`@delete('/x?id=${id}')\`}`), HTML assembled from strings on the server, and markup produced by other scripts. Pass it as the second argument, `precompiled(table, runtimeExpressions(functionCompiler))`, and it costs the same bytes as today. Leave it out once every expression is static; from then on an unseen expression throws `expression not precompiled: <source>`, which `onError` reports. A third argument, `onMiss(src)`, is called for every expression that was not in the table, which is a convenient way to find the last dynamic ones before dropping the fallback.

An expression the build cannot compile is not a build error: it is left out of the table and reaches the fallback, which throws the same `SyntaxError` the runtime always did, or `expression not precompiled` without a fallback. Either way the failure is confined to that attribute and reported through `onError`.

`createRuntime` is `createSigmx` without a default for `expressions`. `createSigmx` is exactly `createRuntime({ ...options, expressions: options.expressions ?? runtimeExpressions(options.compile ?? functionCompiler) })`, so it accepts `precompiled(table)` too, but the reference to the runtime compiler keeps it in the bundle; use `createRuntime` when you want it gone.

## Without Vite

The two functions the plugin uses are exported from `sigmx/precompile` for a build step of your own:

```ts
// build step (Node)
import { extractExpressions, generateTable } from 'sigmx/precompile'
import { builtinPlugins } from 'sigmx/scan'

const meta = builtinPlugins().filter((p) => p.type === 'attribute')
const items = extractExpressions(templateSource, meta, ['data-'])
writeFileSync('src/expressions.js', generateTable(items))
```

```ts
// browser
import { createRuntime, precompiled } from 'sigmx'
import { plugins } from './sigmx-plugins.js'
import { table } from './expressions.js'

createRuntime({ plugins, expressions: precompiled(table) })
```

## With Astro

```js
// astro.config.mjs
import sigmx from '@sigmx/astro'

export default defineConfig({
  integrations: [sigmx({ plugins: 'auto', precompile: true })],
})
```

The integration adds the same Vite plugin and injects a client that uses the table through `precompiled(table, fallback)`. Options: `precompile: { include: ['src', 'content'], extensions: ['.astro'], custom: { upper: 'src/plugins/upper.ts' }, fallback: false }`. The fallback is on by default and `fallback: false` leaves the runtime compiler out; the prefix comes from the integration's `prefix` option, and `custom` defaults to `auto.custom`, so directives of your own are precompiled once you have named their files.

## The table

`generateTable` writes one module:

```js
export const table = {
  "$count": function($, __a, el, evt) { "use strict";return($.count) },
  "$count++; @get('/api/count')": function($, __a, el, evt) { "use strict";$.count++;return( __a.get('/api/count')) },
  "console.log(patch)": function($, __a, el, evt, patch) { "use strict";return(console.log(patch)) },
}
```

Keys are the trimmed source text, so the same text used by two directives compiles once, and parameter names are not part of the key, so a plugin that gains an argument (arguments are only ever appended) keeps tables built before the upgrade valid. Every function takes the root store proxy as `$`, the actions object as `__a`, then `el`, `evt` and the directive's own arguments (`patch` for `on-signal-patch`, for example).

`extractExpressions` keeps an attribute when its name starts with a configured prefix, names a directive the scanner knows, and has a non-empty value in double or single quotes; HTML entities in the value are decoded. Directives whose value is a literal (`mask`, `match-media`, `teleport`, `remove-me`) are skipped unless the attribute carries `__dynamic`. Values built by a template language (`data-text={expr}`, `data-text="<?= $expr ?>"`) are not literals the browser will see and are left to the fallback.

## How expressions change

They do not. The runtime and the build use one pipeline: `transform()` rewrites `$name` into property access on the root store proxy (`$count++` becomes `$.count++`, `$user.name` becomes `$.user.name`, template-literal holes included, strings, comments and regular expressions untouched) and `@name(...)` into a call on the actions object, then the same strict-mode body is compiled. Behaviour, return values and error messages are identical whether an expression was precompiled or compiled in the browser.

One plugin still parses text at runtime: `patch-signals` reads its payload with `JSON.parse` and only falls back to the compiler for a payload that is not valid JSON. The server helpers in every SDK send JSON, so with precompiled expressions nothing on the page calls `new Function`.

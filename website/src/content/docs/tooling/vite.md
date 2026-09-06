---
title: "Vite plugin"
description: "sigmxAuto, sigmxPrecompile and scanProject from sigmx/vite: options, the virtual modules, and a config for plain HTML and for a framework."
sidebar: { order: 4 }
---

`sigmx/vite` exports two Vite plugins and the scanner they share. Nothing in it is Vite-specific beyond the plugin shape, so it works under Astro, SvelteKit, Nuxt, Qwik or a bare `vite.config` with an `index.html`.

```js
import { sigmxAuto, sigmxPrecompile, scanProject } from 'sigmx/vite'
```

## `sigmxAuto(options)`

Serves `virtual:sigmx-plugins`, a module exporting the `plugins` array your source uses and a `report` of why. The scan runs when the module is first loaded, every scanned file is added as a watch file, and the selection is printed once:

```
[sigmx] auto: 13 plugins (applyElements, applyState, attr, bind, className, cloak, httpGet, indicator, on, show, signals, style, text); 37 unused
```

| option | default | meaning |
|---|---|---|
| `root` | `process.cwd()` | project root that `include` and `custom` paths are relative to |
| `include` | `['src', 'index.html']` | files or directories to scan |
| `extensions` | `.astro .html .mdx .md .ts .tsx .js .jsx .svelte .vue .php .erb .twig .hbs` | which files to read |
| `prefixes` | `['data-']` | attribute prefixes in use |
| `always` | `[]` | export names that ship regardless, with their implied dependencies |
| `custom` | `{}` | your own plugins, export name to file; the definition is read from the file, never executed |
| `log` | `true` | print the selection |

The rules for what counts as usage are on the [auto mode](/tooling/auto-mode/) page.

## `sigmxPrecompile(options)`

Serves `virtual:sigmx-expressions`, a module exporting `table`: every literal attribute expression in the scanned files, compiled at build time (see [precompiled expressions](/tooling/precompiled-expressions/)). It takes `root`, `include`, `extensions`, `prefixes` and `custom` with the same meanings; `custom` here means directives of your own whose expressions should be precompiled too. The scan is separate from `sigmxAuto`'s, so pass the same `include` to both.

## `scanProject(options)`

The function both plugins and the CLI call. It takes the `sigmxAuto` options, reads the files, prints any lint warnings, and returns `{ plugins, reasons, unused, files }`, where `plugins` is metadata (`export`, `name`, `type`, `from`) rather than the plugin objects. `generatePluginsModule(selection)` from `sigmx/scan` turns that into the module source the virtual module serves.

## The virtual modules

```ts
import { plugins, report } from 'virtual:sigmx-plugins'
import { table } from 'virtual:sigmx-expressions'
```

Neither has types shipped, because Vite virtual modules are declared per project. Add a declaration file:

```ts
// src/env.d.ts
declare module 'virtual:sigmx-plugins' {
  import type { Plugin } from 'sigmx'
  export const plugins: Plugin[]
  export const report: { reasons: Record<string, string>, unused: string[] }
}
declare module 'virtual:sigmx-expressions' {
  import type { ExpressionTable } from 'sigmx'
  export const table: ExpressionTable
}
```

## Plain HTML

A project with an `index.html` and one script, no framework:

```js
// vite.config.js
import { sigmxAuto, sigmxPrecompile } from 'sigmx/vite'

export default {
  plugins: [sigmxAuto(), sigmxPrecompile()],
}
```

```ts
// src/main.ts
import { createRuntime, precompiled } from 'sigmx'
import { plugins } from 'virtual:sigmx-plugins'
import { table } from 'virtual:sigmx-expressions'

createRuntime({ plugins, expressions: precompiled(table) })
```

```html
<!-- index.html -->
<script type="module" src="/src/main.ts"></script>
<div data-signals="{ count: 0 }">
  <button data-on:click="$count++">+</button>
  <b data-text="$count"></b>
</div>
```

The defaults scan `src` and `index.html`, so both files are covered. Without `sigmxPrecompile`, the entry is `createSigmx({ plugins })` and the runtime compiler ships. To keep the compiler as a fallback for markup built at runtime, pass it: `precompiled(table, runtimeExpressions(functionCompiler))`, both exported from `sigmx`.

## With a framework

The same two plugins in a SvelteKit project, where templates live under `src` with a `.svelte` extension the defaults already cover, and the server may render sigmx attributes from strings:

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite'
import { sigmxAuto, sigmxPrecompile } from 'sigmx/vite'

export default {
  plugins: [
    sveltekit(),
    sigmxAuto({ always: ['signals'], custom: { upper: 'src/lib/plugins/upper.ts' } }),
    sigmxPrecompile({ custom: { upper: 'src/lib/plugins/upper.ts' } }),
  ],
}
```

```ts
// src/lib/sigmx.ts, imported once from the root layout in the browser
import { createRuntime, functionCompiler, precompiled, runtimeExpressions } from 'sigmx'
import { plugins } from 'virtual:sigmx-plugins'
import { table } from 'virtual:sigmx-expressions'

export const app = createRuntime({
  plugins,
  expressions: precompiled(table, runtimeExpressions(functionCompiler)),
})
```

The fallback stays because a Svelte template can build an attribute value from an expression (``data-on:click={`@delete('/items/${id}')`}``), which the scan cannot see. Drop it once every expression is a literal. For Astro, the [integration](/sdks/astro/) wires the same two plugins from `plugins: 'auto'` and `precompile`.

## The uppercase-key lint

`scanProject` checks every scanned file for keyed attributes with a capital letter and prints one warning per occurrence:

```
[sigmx] src/routes/+page.svelte: data-bind:firstName: attribute names are lowercased by HTML; write the key in kebab-case
```

HTML lowercases attribute names before the runtime sees them, so `data-bind:firstName` binds `$firstname`; write `data-bind:first-name`, which binds `$firstName` through the runtime's case conversion. The lint runs with `sigmxAuto` and the CLI, not with `sigmxPrecompile` alone.

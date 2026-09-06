---
title: "Auto mode"
description: "Scan your source for the directives and functions you use and bundle only those, the way a CSS framework scans for class names."
sidebar: { order: 1 }
---

Registering plugins by hand is precise but easy to let drift: a directive gets added to a template and nothing reminds you to register it, or one stops being used and keeps shipping. Auto mode reads your source and works out the list for you. The [Vite plugin](/tooling/vite/), the [CLI](/tooling/cli/), the [Rust crate](/sdks/rust/) and the [Astro integration](/sdks/astro/) all run the rules on this page, over whatever language your templates are written in.

## How usage is detected

| plugin kind | counts as used when |
|---|---|
| directive (`text`, `bind`, …) | `data-<name>` appears in any scanned file, with any prefix you configured (`hx-`, `s-` …), followed by a key, a modifier, `=`, whitespace or the end of the tag |
| function (`@get`, `@fit`, …) | `@name(` appears |
| built-in handlers (`patch-elements`, `patch-signals`) | never by mention; only as implied dependencies |
| implied dependencies | every network function (`httpGet` … `httpDelete`, `websocket`) brings `applyElements` and `applyState`; `boost` brings `httpGet`, `httpPost` and both handlers |
| your own plugins | same rules, once you tell the scanner where they live; a custom handler ships when its name appears as a quoted string, optionally prefixed (`'toast'`, `'sigmx-toast'`) |
| `always` list | ships regardless, with its own implied dependencies |

Detection is textual: a `data-text` inside a JSX prop, a template literal, a PHP or ERB template or a Markdown code block all count. The scan reads every file with a matching extension under the paths you include (`.astro`, `.html`, `.mdx`, `.md`, `.ts`, `.tsx`, `.js`, `.jsx`, `.svelte`, `.vue`, `.php`, `.erb`, `.twig`, `.hbs` by default; the Rust scanner adds `.rs` and more template languages), skipping `node_modules` and dot-directories. Paths may be files as well as directories; the default is `['src', 'index.html']`. Server code counts too, so an endpoint that emits `sigmx-toast` keeps your `toast` handler in the bundle.

The scan also lints keyed attributes written with capital letters: `data-bind:firstName` reaches the runtime as `firstname` because HTML lowercases attribute names, so the build prints `src/form.html: data-bind:firstName: attribute names are lowercased by HTML; write the key in kebab-case`.

## With Vite (any framework)

```js
// vite.config.js
import { sigmxAuto } from 'sigmx/vite'

export default {
  plugins: [
    sigmxAuto({
      always: ['signals', 'httpGet'],            // always ship these
      custom: { upper: 'src/plugins/upper.ts' }, // export name → file; used only if the source refers to it
      include: ['src', 'index.html'],            // paths to scan (the default)
      extensions: ['.html', '.ts'],              // default: the list above
      prefixes: ['data-'],                       // attribute prefixes in use
      log: true,                                 // print the selection at build time
    }),
  ],
}
```

```ts
// your entry
import { createSigmx } from 'sigmx'
import { plugins, report } from 'virtual:sigmx-plugins'

createSigmx({ plugins })
```

The build prints what was selected:

```
[sigmx] auto: 9 plugins (signals, text, on, bind, httpGet, httpPost, applyElements, applyState, upper); 41 unused
```

`report.reasons` maps each selected export to `'used'`, `'always'` or the export that implied it (`applyElements: 'httpGet'`); `report.unused` lists what was left out. The scanned files are registered as watch files, so adding a directive in dev triggers a rescan. Every option is on the [Vite plugin](/tooling/vite/) page, with a plain-HTML and a framework configuration.

## Without a bundler plugin

The CLI writes the same module to a file you check in or generate in CI, whatever builds the rest of your project:

```bash
npx sigmx scan src --out src/sigmx-plugins.js --always signals,httpGet --custom upper=src/plugins/upper.ts --prefix data-,hx-
```

```ts
import { createSigmx } from 'sigmx'
import { plugins } from './sigmx-plugins.js'

createSigmx({ plugins })
```

Flags and output are on the [CLI](/tooling/cli/) page. Projects with no Node at all use the [Rust crate](/sdks/rust/), whose `sigmx entry` writes a complete entry module from the same scan. The programmatic API is `scanProject()` from `sigmx/vite` (files in, selection out) and `selectPlugins()` from `sigmx/scan` (source strings in, selection out, no file system).

## With Astro

The integration wires the Vite plugin from its own options:

```js
// astro.config.mjs
import sigmx from '@sigmx/astro'

export default defineConfig({
  integrations: [
    sigmx({
      plugins: 'auto',
      auto: { always: ['signals', 'httpGet'], custom: { upper: 'src/plugins/upper.ts' }, include: ['src'], extensions: ['.astro', '.ts'], log: true },
    }),
  ],
})
```

The prefix comes from the integration's `prefix` option. Auto mode and `precompile: true` compose, and `precompile` reuses `auto.custom` so your own directives are precompiled too.

## Custom plugins

Your own plugins follow the same rules as the built-ins. The scanner reads a plugin's `name` and kind straight from its definition without running the file, so it needs the usual shape: `export const upper = attribute({ name: 'upper', … })`, or `action({ … })` or `handler({ … })`, with `name` a literal string. `literal: true` and an `args` array are read too, so the precompiler treats the directive correctly. See [writing a directive](/extending/directives/).

```ts
// src/plugins/upper.ts
import { attribute } from 'sigmx'
export const upper = attribute({ name: 'upper', value: 'required', mount({ el, evaluate, effect }) { … } })
```

A custom directive is included when `data-upper` appears somewhere; a custom function when `@shout(` does; a custom handler when its name appears as a string, typically in the server code that emits it. The generated module imports it by a root-relative path (`import { upper } from "/src/plugins/upper.ts"`), which Vite resolves from the project root. When the scanner cannot find a definition in the file it warns `could not read plugin metadata for "upper"` and leaves the plugin out; put it in `always` if it must ship.

Plugins registered at runtime with `instance.use()` are outside the scan; list them under `always` if they must ship, or keep registering them yourself.

## Limits

Attribute names built from strings at runtime (`el.setAttribute('data-' + kind, …)`) or templates outside the scanned paths are invisible to the scan; put those plugins in `always`. False positives cost bytes, never correctness: a code sample that mentions `@ws(` ships the WebSocket function even if nothing calls it. The build warns `no source files found to scan` when `include` matches nothing.

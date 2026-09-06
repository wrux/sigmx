---
title: "Auto mode"
description: "Scan your source for the directives and functions you use and bundle only those, the way a CSS framework scans for class names."
sidebar: { order: 16 }
---

Registering plugins by hand is precise but easy to let drift: a directive gets added to a template and nothing reminds you to register it, or one stops being used and keeps shipping. Auto mode reads your source and works out the list for you.

## How usage is detected

| plugin kind | counts as used when |
|---|---|
| directive (`text`, `bind`, …) | `data-<name>` appears in any scanned file, with any prefix you configured (`hx-`, `s-` …); modifiers and keys are fine |
| function (`@get`, `@fit`, …) | `@name(` appears |
| server-event handlers (`patch-elements`, `patch-signals`) | any network function is used: `@get` … `@delete`, `@ws`, `boost` |
| implied dependencies | `boost` brings `httpGet`, `httpPost` and the morph; every network function brings both handlers |
| your own plugins | same rules, once you tell the scanner where they live |
| `always` list | ships regardless |

Every file under the scanned directories counts, including server code and Markdown, so an endpoint that emits `sigmx-toast` keeps a `toast` handler in the bundle.

## With Astro

```js
// astro.config.mjs
import sigmx from 'sigmx-astro'

export default defineConfig({
  integrations: [
    sigmx({
      plugins: 'auto',
      auto: {
        always: ['signals', 'httpGet'],          // always ship these
        custom: { upper: 'src/plugins/upper.ts' }, // export name → file; used only if the source refers to it
        include: ['src'],                          // directories to scan (default)
      },
    }),
  ],
})
```

The build prints what was selected and why:

```
[sigmx] auto: 9 plugins (signals, text, on, bind, httpGet, httpPost, applyElements, applyState, upper); 45 unused
```

Auto mode and `precompile: true` compose; they share one scan.

## With Vite (any framework)

```js
// vite.config.js
import { sigmxAuto } from 'sigmx/vite'

export default { plugins: [sigmxAuto({ always: ['signals'], custom: { upper: 'src/plugins/upper.ts' } })] }
```

```ts
// your entry
import { createSigmx } from 'sigmx'
import { plugins, report } from 'virtual:sigmx-plugins'

createSigmx({ plugins })
```

`report.reasons` maps each selected export to `'used'`, `'always'` or the plugin that implied it; `report.unused` lists what was left out.

## Without a bundler plugin

The CLI writes the same module to a file you check in or generate in CI:

```bash
npx sigmx scan src --out src/sigmx-plugins.js --always signals,httpGet --custom upper=src/plugins/upper.ts --prefix data-,hx-
```

```ts
import { createSigmx } from 'sigmx'
import { plugins } from './sigmx-plugins.js'

createSigmx({ plugins })
```

The programmatic API is `scanProject()` from `sigmx/vite` and `selectPlugins()` from `sigmx/scan`.

## Custom plugins

The scanner reads a plugin's `name` and kind straight from its definition without running the file, so it needs the usual shape:

```ts
// src/plugins/upper.ts
import { attribute } from 'sigmx'
export const upper = attribute({ name: 'upper', value: 'required', mount({ el, evaluate, effect }) { … } })
```

A custom directive is included when `data-upper` appears somewhere; a custom function when `@shout(` does; a custom handler when its name appears as a string (typically in the server code that emits it). Plugins registered at runtime with `instance.use()` are outside the scan; list them under `always` if they must ship, or keep registering them yourself.

## Limits

Detection is textual. Attribute names built from strings at runtime (`el.setAttribute('data-' + kind, …)`) or templates outside the scanned directories are invisible to it; put those plugins in `always`. False positives cost bytes, never correctness: a code sample that mentions `@ws(` ships the WebSocket function even if nothing calls it.

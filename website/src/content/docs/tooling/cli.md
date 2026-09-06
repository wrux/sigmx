---
title: "CLI"
description: "npx sigmx scan: every flag, what the generated module looks like, and the Rust binary's equivalents."
sidebar: { order: 3 }
---

The `sigmx` package installs one command. `sigmx scan` runs [auto mode](/tooling/auto-mode/) from the shell and writes the plugins module for projects without a bundler plugin, or as a step in CI that checks the committed module is current.

```bash
npx sigmx scan src --out src/sigmx-plugins.js
```

```
wrote src/sigmx-plugins.js: 13 plugins, 37 unused
  attr             used
  bind             used
  className        used
  cloak            used
  httpGet          used
  applyElements    httpGet
  applyState       httpGet
  indicator        used
  on               used
  show             used
  signals          used
  style            used
  text             used
```

## Usage

```
sigmx scan [paths...] [--out FILE] [--always a,b] [--custom name=path,...] [--prefix data-,hx-]
```

| argument | default | meaning |
|---|---|---|
| `paths...` | `src index.html` | files or directories to scan, relative to the current directory; `node_modules` and dot-directories are skipped |
| `--out FILE` | print to stdout | write the module here |
| `--always a,b` | none | export names that ship regardless of the scan, with their implied dependencies |
| `--custom name=path,...` | none | your own plugins: export name and file, relative to the current directory; the definition is read from the file, never run |
| `--prefix data-,hx-` | `data-` | attribute prefixes in use |

The scanned extensions are the defaults of the Vite plugin (`.astro`, `.html`, `.mdx`, `.md`, `.ts`, `.tsx`, `.js`, `.jsx`, `.svelte`, `.vue`, `.php`, `.erb`, `.twig`, `.hbs`); the CLI has no flag to change them, so pass `scanProject({ extensions })` from `sigmx/vite` in a script if you need another set. The project root is the current directory. Running `sigmx` with no command prints the usage and exits 0; an unknown command exits 1.

## What is printed

The module goes to stdout, or to `--out`, in which case one line `wrote FILE: N plugins, M unused` goes to stdout instead. The reasons list always goes to stderr, one export per line: `used`, `always`, or the export that implied it. Uppercase keys in keyed attributes (`data-bind:firstName`) are reported on stderr before the list, as `[sigmx] src/form.html: data-bind:firstName: attribute names are lowercased by HTML; write the key in kebab-case`, and a scan that finds no files warns `no source files found to scan`.

## The generated module

```js
import { applyElements, applyState, bind, httpGet, on, signals, text } from "sigmx/plugins"
import { upper } from "/src/plugins/upper.ts"
export const plugins = [applyElements, applyState, bind, httpGet, on, signals, text, upper]
export const report = {
  "reasons": {
    "bind": "used",
    "httpGet": "used",
    "applyElements": "httpGet",
    "applyState": "httpGet",
    "on": "used",
    "signals": "always",
    "text": "used",
    "upper": "used"
  },
  "unused": [
    "animate",
    "attr",
    "boost"
  ]
}
```

Built-ins are imported from `sigmx/plugins`, which is side-effect free, so a bundler ships exactly these. Custom plugins are imported by a root-relative path, the form Vite resolves from the project root; when the module is consumed by another bundler, or by a browser directly, edit that specifier or point `--custom` at a path the consumer understands. `report` is data for logging and tests; the Vite example prints `Object.keys(report.reasons)` to the console on start.

Use it from your entry:

```ts
import { createSigmx } from 'sigmx'
import { plugins } from './sigmx-plugins.js'

createSigmx({ plugins })
```

## In CI

Regenerate the module and fail when it differs from the committed one:

```bash
npx sigmx scan src --out /tmp/sigmx-plugins.js && diff -q /tmp/sigmx-plugins.js src/sigmx-plugins.js
```

The same selection is available in Node as `scanProject()` from `sigmx/vite`, which returns `{ plugins, reasons, unused, files }`, and as `selectPlugins(sources, { prefixes, always, custom })` from `sigmx/scan`, which takes source strings and touches no file system.

## The Rust binary

The `sigmx` crate ships the same scanner for projects without Node: `cargo install sigmx --features cli`. Its `scan` command matches the JavaScript one and adds `entry`, which writes a complete entry module (`createSigmx` call included) importing from the unpacked client. Details and the crate API are on the [Rust SDK](/sdks/rust/) page.

| npm `sigmx scan` | Rust `sigmx scan` / `sigmx entry` | notes |
|---|---|---|
| `paths...` | `paths...` | Rust defaults to `src`, `templates` and `index.html`, and skips `target` as well as `node_modules` |
| `--out FILE` | `--out FILE` | Rust resolves it against `--root` and creates the directory |
| `--always a,b` | `--always a,b` | same |
| `--custom name=path` | `--custom name=path[:kind:name]` | Rust can declare the kind and directive name when the file is not in the usual shape |
| `--prefix data-,hx-` | `--prefix data-,hx-` | same |
| (fixed) | `--ext .rs,.html` | Rust scans `.rs`, `.tera`, `.jinja`, `.liquid` and the JavaScript list by default |
| (cwd) | `--root DIR` | project root |
| imports from `sigmx/plugins` | `--from ./vendor/sigmx` or `--from sigmx` | a directory from `sigmx client unpack`, or a package name |
| | `entry` only: `--preset all\|essentials\|minimal`, `--plugin name=specifier`, `--event-prefix`, `--expose NAME\|none` | build the entry from a preset instead of a scan; register extra plugins regardless; runtime options |

Both print the selection to stderr; Rust's line is `sigmx: 13 plugins (…); 37 unused; 4 files scanned`.

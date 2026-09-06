---
title: "Migration"
description: "Moving markup and backends from Datastar, htmx or Alpine.js."
sidebar: { order: 7 }
---

## From Datastar

Markup is compatible: the attribute names, key syntax, modifiers and `@action()` calls are the same. Most pages need no edits.

1. Replace the script tag or import with sigmx and register the plugins you use (or the `all` preset).
2. If you cannot change every attribute at once, scan both prefixes: `prefix: ['data-', 'datastar-']` also accepts `datastar-text`.
3. Backends emit `datastar-patch-elements` and `datastar-patch-signals`. Accept them with `eventPrefix: ['sigmx-', 'datastar-']` and switch the server to `sigmx-*` names at your own pace. The request header is `Sigmx-Request` and the GET query parameter is `sigmx`; update server code that reads them.
4. Attributes such as `data-persist`, `data-query-string`, `data-animate` and `@fit` are ordinary plugins here; register them like any other.

Behavioural differences to know about:

| topic | Datastar | sigmx |
|---|---|---|
| reading an unknown signal | creates it as `''` and fires a patch | returns `undefined`, no side effect |
| `data-on-signal-patch` filter | a separate `-filter` attribute | a key: `data-on-signal-patch:user.name` |
| checkbox groups | index-based | array of checked values |
| `data-indicator` | the element that made the request | that element or any element inside it |
| errors in one attribute | can stop the scan | reported through `onError`, scan continues |
| `data-json-signals` | same | same |
| CSP | detected from `<html data-nonce>` | explicit `compile: cspCompiler(nonce)` |

## From htmx

htmx moves HTML; sigmx moves HTML and signals. The nearest equivalents:

| htmx | sigmx |
|---|---|
| `hx-get="/x"` + `hx-trigger="click"` | `data-on:click="@get('/x')"` |
| `hx-target="#t"` + `hx-swap="innerHTML"` | give the response element the target's `id`, or set `sigmx-selector`/`sigmx-mode` headers, or send a `patch-elements` event with `selector` and `mode` |
| `hx-trigger="keyup changed delay:300ms"` | `data-on:keyup__debounce.300ms` |
| `hx-indicator` | `data-indicator:busy` + `data-show="$busy"` |
| `hx-vals` | `payload: {...}` or just signals |
| `hx-boost` | not provided; sigmx is not a page router |

Keep the `hx-` prefix while migrating: `prefix: ['data-', 'hx-']`. Note that `hx-on:click` in sigmx means "run this expression", not htmx's inline handler syntax.

## From Alpine.js

| Alpine | sigmx |
|---|---|
| `x-data="{ open: false }"` | `data-signals="{ open: false }"` (global store, no component scope) |
| `x-on:click` / `@click` | `data-on:click` |
| `x-text`, `x-show`, `x-bind:class`, `x-model` | `data-text`, `data-show`, `data-class`, `data-bind` |
| `x-init` | `data-init` |
| `x-effect` | `data-effect` |
| `$store` | `$` |
| `x-for`, `x-if` | render on the server and patch; sigmx has no client templating |

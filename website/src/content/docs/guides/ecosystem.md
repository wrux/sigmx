---
title: "Coming from Alpine or htmx"
description: "The plugins people reach for in Alpine.js, htmx and Datastar, and their sigmx equivalents."
sidebar: { order: 15 }
---

Most of what the Alpine and htmx ecosystems add as plugins or extensions exists here as an opt-in directive or function. Register only what you use.

## Alpine.js

| Alpine | sigmx | notes |
|---|---|---|
| `x-cloak` | [`data-cloak`](/reference/directives/cloak/) | same CSS rule, `[data-cloak] { display: none !important }` |
| `x-collapse` | [`data-collapse`](/reference/directives/collapse/) | standalone, no `x-show` needed; `__duration` |
| `x-transition` | [`data-transition`](/reference/directives/transition/) | fade with optional scale; class-based transitions are not provided |
| `x-mask` | [`data-mask`](/reference/directives/mask/) | `__dynamic` for `x-mask:dynamic` |
| `x-trap` | use a native `<dialog>` and `showModal()`; it traps focus and makes the rest of the page inert | |
| `x-teleport` | [`data-teleport`](/reference/directives/teleport/) | selector value |
| `x-html` | [`data-html`](/reference/directives/html/) | |
| `x-intersect` | [`data-on-intersect`](/reference/directives/on-intersect/) | |
| `x-resize` | [`data-on-resize`](/reference/directives/on-resize/) | |
| `$persist` | [`data-persist`](/reference/directives/persist/) | |
| `$dispatch` | [`@dispatch`](/reference/functions/dispatch/) | |
| `$watch` | [`data-on-signal-patch`](/reference/directives/on-signal-patch/) | |
| `x-anchor`, `x-sort` | not provided | both wrap a large third-party library; use it directly from a `data-init` |
| `x-for`, `x-if` | not provided | render on the server and patch; sigmx has no client templating |

## htmx

| htmx | sigmx | notes |
|---|---|---|
| `hx-boost` | [`data-boost`](/reference/directives/boost/) | whole-document morph with history |
| `hx-confirm` | [`@confirm`](/reference/functions/confirm/) | `@confirm('…') && @post('/x')` |
| `hx-ext="ws"` | [`@ws`](/reference/functions/ws/) | messages in event-stream form |
| `hx-ext="sse"` | built in | any `@get` whose response is `text/event-stream` |
| `remove-me` | [`data-remove-me`](/reference/directives/remove-me/) | |
| `hx-indicator`, loading states | [`data-indicator`](/reference/directives/indicator/) with `data-show`, `data-class`, `data-attr:disabled` | |
| `hx-trigger="every 2s"` | [`data-on-interval`](/reference/directives/on-interval/) | |
| `hx-trigger="revealed"` | [`data-on-intersect__once`](/reference/directives/on-intersect/) | |
| `hx-trigger="keyup changed delay:300ms"` | `data-on:keyup__debounce.300ms` | |
| `hx-swap-oob` | built in | top-level elements in a response morph by id |
| `hx-preserve` | `data-ignore-morph`, `data-preserve-attr` | |
| `hx-push-url`, `hx-replace-url` | [`data-query-string`](/reference/directives/query-string/), [`data-replace-url`](/reference/directives/replace-url/) | |
| `hx-sync` | the `abort` request option | |
| `hx-vals`, `hx-headers` | `payload` and `headers` request options | |
| `hx-ext="json-enc"` | default; `contentType: 'form'` for forms | |
| `head-support` | built in | full-document responses morph the head |

## Datastar

Everything in the reference, plus the plugins above. Markup is compatible; see [Migration](/guides/migration/).

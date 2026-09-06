---
title: "createSigmx()"
description: "Options and the instance API."
sidebar: {"order": 1}
---

```ts
import { createSigmx } from 'sigmx'
const app = createSigmx(options)
```

## Options

| option | type | default | |
|---|---|---|---|
| `plugins` | `Plugin[]` | `[]` | directives, functions and handlers to register |
| `prefix` | `string \| string[]` | `'data-'` | attribute prefixes to scan; the first is primary |
| `eventPrefix` | `string \| string[]` | `'sigmx-'` | server event-name prefixes to accept |
| `compile` | `Compiler` | `new Function` | expression compiler; see `sigmx/csp` |
| `store` | `Store` | a new store | share state with another instance |
| `onError` | `(error, { plugin, el, attr }) => void` | `console.error` | error sink |
| `autoStart` | `boolean` | `true` | scan `document.documentElement` on DOM ready |

## Instance

| member | |
|---|---|
| `store` | the [store](/reference/api/store/) |
| `$` | root store proxy: `app.$.count++` |
| `apply(root?, observe = true)` | mount plugins under a root (element or shadow root) and watch it |
| `use(...plugins)` | register more plugins; directives are applied to observed roots at once |
| `destroy()` | disconnect observers, tear down every mounted attribute |
| `runtime` | services plugins see: `prefixes`, `attr()`, `compiler`, `emit()`, `handle()`, plugin maps |

## Plugin shapes

```ts
type AttributePlugin = { type: 'attribute'; name; key?: 'required' | 'forbidden'; value?: 'required' | 'forbidden'; returns?: boolean; args?: string[]; mount(ctx): void | (() => void) }
type ActionPlugin    = { type: 'action'; name; call(ctx, ...args): any }
type HandlerPlugin   = { type: 'handler'; name; handle(runtime, data: Record<string, string>): void }
```

`attribute()`, `action()` and `handler()` from `sigmx` build these with types filled in. See [Writing plugins](/guides/plugins/).

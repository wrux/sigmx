---
title: "Store"
description: "The path-keyed signal store."
sidebar: {"order": 2}
---

```ts
import { createStore } from 'sigmx'
const store = createStore()
```

| method | |
|---|---|
| `get(path)` | value at a dotted path: a leaf value, a namespace proxy, or `undefined`. Reads subscribe the current effect. |
| `set(path, value)` | replace the value; plain objects become namespaces; `null`/`undefined` removes |
| `merge(patch, { at?, ifMissing? })` | JSON merge-patch into the root or a path; computed leaves are skipped |
| `remove(path)` | remove a leaf or a whole namespace |
| `has(path)` | |
| `define(path, signal)` | install a `Signal` or `Computed` as the leaf |
| `paths(filter?)` | every leaf path, optionally filtered |
| `snapshot(filter?, { at?, computed? })` | plain-object copy |
| `onPatch(fn)` | called after each settled batch with the nested patch; returns an unsubscribe |
| `$` | root namespace proxy |
| `scope` | the identifier scope expressions run in (`$name` → path `name`) |

Filters are `{ include?: RegExp | string; exclude?: RegExp | string }` or a predicate over paths.

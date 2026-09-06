---
title: "Reactivity primitives"
description: "signal, computed, effect, batch, untracked."
sidebar: {"order": 3}
---

The kernel's reactive graph is exported for plugin authors and for use outside the DOM.

```ts
import { signal, computed, effect, batch, untracked, onSettled, flush } from 'sigmx'

const n = signal(1)
const double = computed(() => n.value * 2)
const stop = effect(() => console.log(double.value))   // logs 2
batch(() => { n.value = 2; n.value = 3 })              // logs 6 once
untracked(() => n.value)                               // read without subscribing
n.peek()                                               // same, for one signal
n.bump()                                               // notify after mutating an object in place
stop()
```

- `Signal<T>`: `value` (get/set), `peek()`, `bump()`.
- `Computed<T>`: read-only `value`, lazily recomputed; its version moves only when the result changes, so downstream effects can skip runs.
- `effect(fn, onError?)`: runs now and on change; effects created inside an effect are disposed when the parent re-runs; returns a disposer.
- `batch(fn)`: coalesce writes. `onSettled(fn)`: run after each flush. `flush()`: run queued effects now.

The graph has no DOM dependency and is tested in Node.

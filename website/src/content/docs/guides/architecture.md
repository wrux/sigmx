---
title: "Architecture"
description: "How the kernel is put together, for contributors and the curious."
sidebar: { order: 12 }
---

```
src/
  kernel/
    reactive.ts    Signal, Computed, effect, batch, untracked, onSettled   (no DOM)
    state.ts       createStore(): path-keyed signals, merge-patch, snapshot, proxies   (no DOM)
    compile.ts     compile(): with(scope) expressions, @action rewrite, statement split   (no DOM)
    strict-csp.ts  cspCompiler(nonce)
    runtime.ts     createSigmx(): scanning, mounting, MutationObserver, error isolation
    contracts.ts   Ctx, Runtime, plugin and option types
  lib/             objects (isPlain, expand, filters), casing, schedule (debounce, throttle, mods), sse
  plugins/
    directives/    one file per attribute
    functions/     @-functions, including the request client
    server-events/ patch-signals, patch-elements, morph
  presets/         minimal, all
  standalone.ts    script-tag entry
```

## Reactivity

A `Signal` holds a value and a version. Reading inside a tracker records `(signal, version)`; writing bumps the version and invalidates subscribers. A `Computed` is a signal with a getter: invalidation marks it dirty and propagates; reading refreshes it, and its version moves only when the result changes. Effects are queued on invalidation; when the queue flushes, an effect first checks whether any recorded dependency version moved (refreshing computeds on the way) and skips the run if not. Effects created inside an effect are disposed when the parent re-runs. `batch` defers flushing, and `onSettled` runs after a flush, which is how the store emits one patch event per transaction.

## Store

A `Map<path, Signal>` for leaves and a `Map<path, Set<name>>` for namespaces. One `shape` signal is bumped on any structural change; enumerations and unknown-path reads subscribe to it, so a reader of a not-yet-existing signal re-runs when the signal appears. Plain objects always become namespaces; arrays and other objects are leaves, and arrays are handed out through a proxy that notifies on mutation. Two proxies sit on top: the namespace proxy (`$`) for property access and enumeration, and the scope proxy used by `with`, which answers only identifiers that start with `$`.

## Expressions

`compile(compiler, src, params, returns)` wraps the source as `with($){ return (src) }`, falling back to statement form with the last statement returned. A small scanner rewrites `@name(` to a call on the per-evaluation actions object and splits statements, skipping string, template and comment contents. Results are cached by source and parameter list.

## Engine

`createSigmx` builds a `Runtime` (prefixes, store, compiler, plugin maps, `emit`, `handle`) and scans roots: for every attribute whose name starts with a configured prefix it parses `plugin[:key][__mod.arg]*`, validates the plugin's key and value requirements, builds a `Ctx`, and calls `mount`. Everything the plugin registers through the context is pushed onto a disposer list keyed by element and attribute. A `MutationObserver` mounts added subtrees, unmounts removed ones and remounts changed attributes. Errors from mount, effects and listeners go to `onError`.

## Morph

Before walking, the morph computes the set of ids present in both trees with matching tag names. Walking children, an id in that set is looked up among the remaining siblings, in a pantry fragment of displaced nodes, or in the document, and moved into place with `moveBefore` where available. Other nodes match positionally by node type and tag. Nodes that are removed but contain kept ids go to the pantry instead of being destroyed. Form state is compared by attribute, not live value.

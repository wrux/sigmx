# Architecture

```
src/
  core/
    signals.ts   Signal, Computed, effect, batch, untracked, onSettled   (no DOM)
    store.ts     createStore(): path-keyed signals, merge-patch, snapshot, proxies   (no DOM)
    expr.ts      compile(): `with(scope)` expressions, @action rewrite, statement split   (no DOM)
    csp.ts       cspCompiler(nonce): nonce/Trusted Types alternative to new Function
    engine.ts    createSigmx(): scanning, mounting, MutationObserver, error isolation
    types.ts     Ctx, Runtime, plugin and option types
    index.ts     public API + attribute()/action()/handler() typing helpers
  utils/         object (isPlain, expand, filters), text (recase), timing (debounce, throttle, mods)
  plugins/       one pure `export const x = attribute({...})` per file; index.ts barrel
  presets/       minimal, all
  auto.ts        script-tag entry
```

## Reactivity

`Signal` holds a value and a version. Reading inside a tracker records `(signal, version)`; writing bumps the version and invalidates subscribers. `Computed` is a signal with a getter: invalidation marks it dirty and propagates; reading refreshes it, and its version only moves when the result changes. `Effect` is queued on invalidation; when the queue flushes it first checks whether any recorded dependency version moved (refreshing computeds on the way) and skips the run if not. Effects created inside an effect are disposed when the parent re-runs. `batch` defers flushing; `onSettled` runs after a flush, which is how the store emits one patch event per transaction.

## Store

`Map<path, Signal>` for leaves plus `Map<path, Set<name>>` for namespaces. A single `shape` signal is bumped on any structural change; enumerations and unknown-path reads subscribe to it. Plain objects always become namespaces; arrays and other objects are leaves. `merge` implements JSON merge-patch: objects merge, `null` removes, other values replace, and computed leaves are skipped. Two proxies sit on top: the namespace proxy (`$`) for property access and enumeration, and the scope proxy used by `with`, which answers only identifiers starting with `$`.

## Expressions

`compile(compiler, src, params, returns)` wraps the source as `with($){ return (src) }`, falling back to statement form with the last statement returned. The scanner that rewrites `@name(` and splits statements skips string, template and comment contents. Results are cached by source and parameter list. The default compiler is `new Function`; `cspCompiler` injects a nonce script instead.

## Engine

`createSigmx` builds a `Runtime` (prefixes, store, compiler, plugin maps, `emit`) and scans roots: for every element attribute whose name starts with a configured prefix, it parses `plugin[:key][__mod.arg]*`, validates the plugin's `key`/`value` requirements, builds a `Ctx`, and calls `mount`. Everything the plugin registers through the context is pushed onto a disposer list keyed by element and attribute name. A `MutationObserver` mounts added subtrees, unmounts removed ones, and remounts changed attributes. Errors from mount, effects and listeners go to `onError`.

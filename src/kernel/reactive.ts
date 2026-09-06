// Reactive primitives: push invalidation, pull recomputation, version-checked effects.
// No DOM dependency, so this module is unit-testable in plain Node.
// Members prefixed with `_` are internal and get mangled by the build.

interface Tracker {
  _deps: Map<Signal<any>, number>
  _invalidate(): void
}

let active: Tracker | undefined
let owner: Effect | undefined
let depth = 0
let flushing = false
const queue = new Set<Effect>()
const settled = new Set<() => void>()

export class Signal<T> {
  /** @internal */ _v: T
  /** @internal */ _ver = 0
  /** @internal */ _subs = new Set<Tracker>()
  constructor(v: T) {
    this._v = v
  }
  get value(): T {
    if (active) {
      active._deps.set(this, this._ver)
      this._subs.add(active)
    }
    return this._v
  }
  set value(x: T) {
    if (!Object.is(x, this._v)) {
      this._v = x
      this.bump()
    }
  }
  /** Read without subscribing. */
  peek(): T {
    return this._v
  }
  /** Notify subscribers without replacing the value (after mutating an array or object in place). */
  bump(): void {
    this._ver++
    for (const s of [...this._subs]) s._invalidate()
    if (!depth) flush()
  }
}

const release = (t: Tracker): void => {
  for (const d of t._deps.keys()) d._subs.delete(t)
  t._deps.clear()
}

/** True when any dependency's version moved since the tracker last ran. Refreshes computeds on the way. */
const stale = (t: Tracker): boolean => {
  for (const [d, seen] of t._deps) {
    if (d instanceof Computed) d._refresh()
    if (d._ver !== seen) return true
  }
  return false
}

const capture = <R>(t: Tracker, fn: () => R): R => {
  release(t)
  const prev = active
  active = t
  try {
    return fn()
  } finally {
    active = prev
  }
}

export class Computed<T> extends Signal<T> implements Tracker {
  _deps = new Map<Signal<any>, number>()
  /** @internal */ _dirty = true
  /** @internal */ _fn: () => T
  constructor(fn: () => T) {
    super(undefined as T)
    this._fn = fn
  }
  /** @internal */ _refresh(): void {
    if (!this._dirty) return
    this._dirty = false
    if (this._deps.size && !stale(this)) return
    const x = capture(this, this._fn)
    if (!Object.is(x, this._v)) {
      this._v = x
      this._ver++
    }
  }
  override get value(): T {
    this._refresh()
    return super.value
  }
  override set value(_: T) {
    throw new Error('computed signals are read-only')
  }
  override peek(): T {
    this._refresh()
    return this._v
  }
  _invalidate(): void {
    if (!this._dirty) {
      this._dirty = true
      for (const s of this._subs) s._invalidate()
    }
  }
}

class Effect implements Tracker {
  _deps = new Map<Signal<any>, number>()
  _queued = false
  _dead = false
  _kids = new Set<Effect>()
  _fn: () => void
  _onError?: (e: unknown) => void
  constructor(fn: () => void, onError?: (e: unknown) => void) {
    this._fn = fn
    this._onError = onError
  }
  _invalidate(): void {
    if (!this._dead && !this._queued) {
      this._queued = true
      queue.add(this)
    }
  }
  _exec(): void {
    this._queued = false
    if (this._dead || (this._deps.size && !stale(this))) return
    for (const c of this._kids) c._dispose()
    this._kids.clear()
    const prevOwner = owner
    owner = this
    depth++
    try {
      capture(this, this._fn)
    } catch (e) {
      if (!this._onError) throw e
      this._onError(e)
    } finally {
      depth--
      owner = prevOwner
    }
  }
  _dispose(): void {
    this._dead = true
    release(this)
    for (const c of this._kids) c._dispose()
    this._kids.clear()
    queue.delete(this)
  }
}

export const signal = <T>(value: T): Signal<T> => new Signal(value)
export const computed = <T>(fn: () => T): Computed<T> => new Computed(fn)

/**
 * Run `fn` now and again whenever a signal it read changes. Effects created inside another
 * effect are disposed when the parent re-runs. Returns a disposer.
 */
export const effect = (fn: () => void, onError?: (e: unknown) => void): (() => void) => {
  const e = new Effect(fn, onError)
  owner?._kids.add(e)
  e._exec()
  if (!depth) flush()
  return () => e._dispose()
}

/** Coalesce many writes into one round of effect runs. */
export const batch = <R>(fn: () => R): R => {
  depth++
  try {
    return fn()
  } finally {
    if (!--depth) flush()
  }
}

/** Read signals inside `fn` without subscribing the current effect to them. */
export const untracked = <R>(fn: () => R): R => {
  const prev = active
  active = undefined
  try {
    return fn()
  } finally {
    active = prev
  }
}

/** Called after each flush once every queued effect has run. */
export const onSettled = (fn: () => void): (() => void) => {
  settled.add(fn)
  return () => settled.delete(fn)
}

export const flush = (): void => {
  if (flushing || depth) return
  flushing = true
  try {
    let guard = 0
    while (queue.size) {
      if (++guard > 1e5) throw new Error('effect loop: a signal is written by an effect that reads it')
      const e: Effect = queue.values().next().value!
      queue.delete(e)
      e._exec()
    }
  } finally {
    flushing = false
  }
  for (const fn of settled) fn()
}

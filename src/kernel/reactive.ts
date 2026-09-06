// Members prefixed with `_` are internal and get mangled by the build.

interface Tracker {
  _deps: Map<Signal<any>, number>;
  _invalidate(): void;
}

let active: Tracker | undefined;
let owner: Effect | undefined;
let depth = 0;
let flushing = false;
const queue = new Set<Effect>();
const settled = new Set<() => void>();

export class Signal<T> {
  declare _v: T;
  _ver = 0;
  _subs = new Set<Tracker>();
  constructor(v: T) {
    this._v = v;
  }
  get value(): T {
    if (active) {
      active._deps.set(this, this._ver);
      this._subs.add(active);
    }
    return this._v;
  }
  set value(x: T) {
    if (!Object.is(x, this._v)) {
      this._v = x;
      this.bump();
    }
  }
  peek(): T {
    return this._v;
  }
  /** Notify subscribers without replacing the value (after mutating an array or object in place). */
  bump(): void {
    this._ver++;
    for (const s of this._subs) s._invalidate();
    depth || flush();
  }
}

/** Drop `t`'s subscriptions. */
const release = (t: Tracker): void => {
  for (const d of t._deps.keys()) d._subs.delete(t);
  t._deps.clear();
};

/** Drop `t`'s subscriptions, then run `fn` with `t` as the active tracker so its reads re-subscribe. */
const capture = <R>(t: Tracker, fn: () => R): R => {
  release(t);
  const prev = active;
  active = t;
  try {
    return fn();
  } finally {
    active = prev;
  }
};

/** True when `t` has never run or any dependency's version moved since. Refreshes computeds on the way. */
const stale = (t: Tracker): boolean => {
  if (!t._deps.size) return true;
  for (const [d, seen] of t._deps) {
    if (d instanceof Computed) d._refresh();
    if (d._ver !== seen) return true;
  }
  return false;
};

export class Computed<T> extends Signal<T> implements Tracker {
  declare _fn: () => T;
  _deps = new Map<Signal<any>, number>();
  _dirty = true;
  constructor(fn: () => T) {
    super(undefined as T);
    this._fn = fn;
  }
  _refresh(): void {
    if (!this._dirty) return;
    this._dirty = false;
    if (!stale(this)) return;
    const x = capture(this, this._fn);
    if (!Object.is(x, this._v)) {
      this._v = x;
      this._ver++;
    }
  }
  override get value(): T {
    this._refresh();
    return super.value;
  }
  override set value(_: T) {
    throw new Error('computed is read-only');
  }
  _invalidate(): void {
    if (!this._dirty) {
      this._dirty = true;
      for (const s of this._subs) s._invalidate();
    }
  }
  /** Unsubscribe from every dependency; the computed is no longer recalculated. Public: the store calls it. */
  dispose(): void {
    release(this);
    this._dirty = false;
  }
}

class Effect implements Tracker {
  _deps = new Map<Signal<any>, number>();
  _queued = false;
  _dead = false;
  _kids = new Set<Effect>();
  declare _fn: () => void;
  declare _onError?: (e: unknown) => void;
  constructor(fn: () => void, onError?: (e: unknown) => void) {
    this._fn = fn;
    this._onError = onError;
  }
  _invalidate(): void {
    if (!this._dead && !this._queued) {
      this._queued = true;
      queue.add(this);
    }
  }
  _exec(): void {
    this._queued = false;
    if (this._dead) return;
    const prevOwner = owner;
    owner = this;
    depth++;
    try {
      // `stale` refreshes computeds, which may throw: that belongs to this effect's error handling.
      if (stale(this)) {
        this._drop();
        capture(this, this._fn);
      }
    } catch (e) {
      if (!this._onError) throw e;
      this._onError(e);
    } finally {
      depth--;
      owner = prevOwner;
    }
  }
  _drop(): void {
    for (const c of this._kids) c._dispose();
    this._kids.clear();
  }
  _dispose(): void {
    this._dead = true;
    release(this);
    if (active === this) active = undefined; // disposed from inside its own run: stop subscribing
    this._drop();
    queue.delete(this);
  }
}

export const signal = <T>(value: T): Signal<T> => new Signal(value);
export const computed = <T>(fn: () => T): Computed<T> => new Computed(fn);

/**
 * Run `fn` now and again whenever a signal it read changes. Effects created inside another
 * effect are disposed when the parent re-runs. Returns a disposer.
 */
export const effect = (fn: () => void, onError?: (e: unknown) => void): (() => void) => {
  const e = new Effect(fn, onError);
  owner?._kids.add(e);
  try {
    e._exec();
    depth || flush();
  } catch (err) {
    e._dispose(); // a first run that throws (or loops) without a handler leaves nothing subscribed
    throw err;
  }
  return () => e._dispose();
};

/**
 * Like `effect`, but never owned by the effect that happens to be running: for long-lived effects
 * such as mounted attributes, which must not die when an unrelated parent effect re-runs.
 */
export const rootEffect = (fn: () => void, onError?: (e: unknown) => void): (() => void) => {
  const prev = owner;
  owner = undefined;
  try {
    return effect(fn, onError);
  } finally {
    owner = prev;
  }
};

export const batch = <R>(fn: () => R): R => {
  depth++;
  try {
    return fn();
  } finally {
    --depth || flush();
  }
};

export const untracked = <R>(fn: () => R): R => {
  const prev = active;
  active = undefined;
  try {
    return fn();
  } finally {
    active = prev;
  }
};

export const onSettled = (fn: () => void): (() => void) => {
  settled.add(fn);
  return () => settled.delete(fn);
};

export const flush = (): void => {
  if (flushing || depth) return;
  flushing = true;
  let thrown: unknown;
  let failed = false;
  try {
    let guard = 0;
    while (queue.size) {
      if (++guard > 1e5) {
        // Leave nothing behind, or every later flush would trip the same guard; the effects stay
        // subscribed and run again on their next change.
        for (const e of queue) e._queued = false;
        queue.clear();
        throw new Error('effect loop');
      }
      const e = queue.values().next().value as Effect;
      queue.delete(e);
      try {
        e._exec();
      } catch (err) {
        // One throwing effect (no onError) must not starve the others; rethrow after the flush.
        if (!failed) {
          failed = true;
          thrown = err;
        }
      }
    }
  } finally {
    flushing = false;
  }
  for (const fn of settled) fn();
  if (failed) throw thrown;
};

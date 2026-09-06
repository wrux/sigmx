import { expand, type Filter, isPlain, safeKey, toPredicate } from '../lib/objects.js';
import { batch, Computed, onSettled, Signal } from './reactive.js';

export type Patch = Record<string, any>;

export interface Store {
  /** Value at a dotted path: a leaf value, a namespace proxy, or undefined. Reads subscribe. */
  get(path: string): any;
  /** Replace the value at a path. Plain objects become namespaces; null/undefined removes. */
  set(path: string, value: any): void;
  /** JSON merge-patch (RFC 7396): objects merge, null removes, everything else replaces. */
  merge(patch: Patch, options?: { at?: string; ifMissing?: boolean }): void;
  remove(path: string): void;
  has(path: string): boolean;
  define(path: string, node: Signal<any>): void;
  /** Leaf paths, filtered; `computed: false` leaves out computed signals. */
  paths(filter?: Filter, options?: { computed?: boolean }): string[];
  snapshot(filter?: Filter, options?: { at?: string; computed?: boolean }): Patch;
  /** Called after each settled batch with the nested object of changed paths (null = removed). */
  onPatch(fn: (patch: Patch) => void): () => void;
  readonly $: any;
}

/** 'a.b.c' → ['a.b', 'c']; 'a' → ['', 'a']. */
const split = (p: string): [string, string] => {
  const i = p.lastIndexOf('.');
  return [i < 0 ? '' : p.slice(0, i), p.slice(i + 1)];
};
const join = (a: string, b: string): string => (a ? `${a}.${b}` : b);
const under = (p: string, at: string): boolean => !at || p.startsWith(`${at}.`);
const str = (k: unknown): k is string => typeof k === 'string';
/** Proxy → the raw array or object behind it, so a proxied value can be stored or compared. */
const rawOf = new WeakMap<object, object>();

export const createStore = (): Store => {
  const leaves = new Map<string, Signal<any>>();
  const kids = new Map<string, Set<string>>([['', new Set()]]);
  const shape = new Signal(0); // bumped on any structural change; enumerations subscribe to it
  const pending = new Map<string, any>();
  const listeners = new Set<(p: Patch) => void>();
  const nsCache = new Map<string, any>();
  /** Per leaf signal, per raw object: its reactive proxy. */
  const proxies = new WeakMap<Signal<any>, WeakMap<object, any>>();

  /** Register `p` under its parent namespace (creating the namespace chain) and mark the shape changed. */
  const link = (p: string): void => {
    const [parent, name] = split(p);
    ensureNs(parent).add(name);
    shape.bump();
  };
  const unlink = (p: string): void => {
    const [parent, name] = split(p);
    kids.get(parent)?.delete(name);
    shape.bump();
  };

  const ensureNs = (p: string): Set<string> => {
    let set = kids.get(p);
    if (!set) {
      if (leaves.has(p)) dropLeaf(p);
      set = new Set();
      kids.set(p, set);
      link(p);
    }
    return set;
  };

  const dropLeaf = (p: string): void => {
    const s = leaves.get(p);
    if (!s) return;
    leaves.delete(p);
    unlink(p);
    pending.set(p, null);
    s.bump();
    if (s instanceof Computed) s.dispose();
  };

  const dropNs = (p: string): void => {
    const set = kids.get(p);
    if (!set) return;
    for (const k of [...set]) remove(join(p, k));
    if (p) {
      kids.delete(p);
      nsCache.delete(p);
      unlink(p);
    }
  };

  const remove = (p: string): void =>
    batch(() => {
      dropLeaf(p);
      dropNs(p);
    });

  const define = (p: string, node: Signal<any>): void =>
    batch(() => {
      dropNs(p);
      const old = leaves.get(p);
      leaves.set(p, node);
      link(p);
      if (old) {
        old.bump();
        if (old instanceof Computed) old.dispose();
      }
    });

  const set = (p: string, v: any): void =>
    batch(() => {
      if (v == null) return remove(p);
      v = (v && rawOf.get(v)) ?? v;
      if (isPlain(v)) {
        for (const k of [...ensureNs(p)]) if (!(k in v)) remove(join(p, k));
        for (const k in v) if (safeKey(k)) set(join(p, k), v[k]);
        return;
      }
      dropNs(p);
      const s = leaves.get(p);
      if (s instanceof Computed) throw new Error(`computed "${p}" is read-only`);
      if (s) {
        if (Object.is(s.peek(), v)) return;
        s.value = v;
      } else {
        define(p, new Signal(v));
      }
      pending.set(p, v);
    });

  const merge = (patch: Patch, { at = '', ifMissing = false } = {}): void =>
    batch(() => {
      if (!isPlain(patch)) return;
      const keys = Object.keys(patch).filter(safeKey);
      if (keys.length) ensureNs(at);
      for (const k of keys) {
        const p = join(at, k);
        const v = patch[k];
        const leaf = leaves.get(p);
        // Existing values win under ifMissing, and computed leaves are never overwritten by a patch.
        if (leaf && (ifMissing || leaf instanceof Computed)) continue;
        if (v === null) {
          if (!ifMissing) remove(p);
        } else if (isPlain(v)) merge(v, { at: p, ifMissing });
        else if (!(ifMissing && kids.has(p))) set(p, v);
      }
    });

  const has = (p: string): boolean => leaves.has(p) || kids.has(p);

  /**
   * Arrays are returned through a proxy so in-place mutation notifies the leaf: writes anywhere
   * inside (nested objects and arrays included) bump the leaf, and array methods run as one batch.
   * Proxies are cached per leaf, so the same object under two paths notifies both.
   */
  const wrapArray = (raw: any[], s: Signal<any>, p: string): any => {
    let cache = proxies.get(s);
    if (!cache) {
      cache = new WeakMap();
      proxies.set(s, cache);
    }
    const touch = () => {
      pending.set(p, raw);
      s.bump();
      return true;
    };
    const wrap = (target: object): any => {
      let px = cache?.get(target);
      if (!px) {
        px = new Proxy(target, {
          get: (t, k, r) => {
            const v = Reflect.get(t, k, r);
            if (typeof v === 'function' && Array.isArray(t)) return (...a: any[]) => batch(() => v.apply(r, a));
            if (!v || typeof v !== 'object' || !(Array.isArray(v) || isPlain(v))) return v;
            const d = Object.getOwnPropertyDescriptor(t, k);
            return d && !d.configurable && !d.writable ? v : wrap(v); // frozen data: the proxy invariant forbids wrapping
          },
          set: (t, k, v) => {
            (t as any)[k] = (v && rawOf.get(v)) ?? v;
            return touch();
          },
          deleteProperty: (t, k) => {
            delete (t as any)[k];
            return touch();
          },
        });
        cache?.set(target, px);
        rawOf.set(px, target);
      }
      return px;
    };
    return wrap(raw);
  };

  const get = (p: string): any => {
    const s = leaves.get(p);
    if (s) {
      const v = s.value;
      return Array.isArray(v) ? wrapArray(v, s, p) : v;
    }
    shape.value; // subscribe: a namespace may become a leaf, and a missing path may appear
    if (kids.has(p)) return ns(p);
  };

  const ns = (p: string): any => {
    let px = nsCache.get(p);
    if (!px) {
      const names = (k: unknown): k is string => {
        shape.value; // read so the effect tracks shape changes
        return str(k) && !!kids.get(p)?.has(k);
      };
      px = new Proxy(
        {},
        {
          get: (_, k) =>
            !str(k) ? undefined : k === 'toJSON' ? () => snapshot(undefined, { at: p }) : get(join(p, k)),
          set: (_, k, v) => {
            if (str(k)) set(join(p, k), v);
            return true;
          },
          deleteProperty: (_, k) => {
            if (str(k)) remove(join(p, k));
            return true;
          },
          has: (_, k) => names(k),
          ownKeys: () => {
            shape.value;
            return [...(kids.get(p) ?? [])];
          },
          getOwnPropertyDescriptor: (_, k) =>
            names(k) ? { enumerable: true, configurable: true, writable: true, value: get(join(p, k)) } : undefined,
        },
      );
      nsCache.set(p, px);
    }
    return px;
  };

  const paths = (filter?: Filter, { computed = true } = {}): string[] => {
    shape.value;
    const ok = toPredicate(filter);
    return [...leaves].filter(([p, s]) => ok(p) && (computed || !(s instanceof Computed))).map(([p]) => p);
  };

  const snapshot = (filter?: Filter, { at = '', computed = true } = {}): Patch => {
    const out: Patch = {};
    for (const p of paths(filter, { computed }))
      if (under(p, at)) expand(out, at ? p.slice(at.length + 1) : p, leaves.get(p)?.value);
    return out;
  };

  onSettled(() => {
    if (!pending.size) return;
    const patch: Patch = {};
    for (const [p, v] of pending) expand(patch, p, v);
    pending.clear();
    for (const fn of listeners) fn(patch);
  });

  return {
    get,
    set,
    merge,
    remove,
    has,
    define,
    paths,
    snapshot,
    onPatch: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get $() {
      return ns('');
    },
  };
};

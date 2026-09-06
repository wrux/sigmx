import { expand, type Filter, isPlain, toPredicate } from '../lib/objects.js';
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
  paths(filter?: Filter): string[];
  snapshot(filter?: Filter, options?: { at?: string; computed?: boolean }): Patch;
  /** Called after each settled batch with the nested object of changed paths (null = removed). */
  onPatch(fn: (patch: Patch) => void): () => void;
  readonly $: any;
  /** Identifier scope for compiled expressions: resolves `$count`, `$user`, and `$`. */
  readonly scope: object;
}

/** 'a.b.c' → ['a.b', 'c']; 'a' → ['', 'a']. */
const split = (p: string): [string, string] => {
  const i = p.lastIndexOf('.');
  return [i < 0 ? '' : p.slice(0, i), p.slice(i + 1)];
};
const join = (a: string, b: string): string => (a ? `${a}.${b}` : b);
const under = (p: string, at: string): boolean => !at || p === at || p.startsWith(`${at}.`);
const str = (k: unknown): k is string => typeof k === 'string';

export const createStore = (): Store => {
  const leaves = new Map<string, Signal<any>>();
  const kids = new Map<string, Set<string>>([['', new Set()]]);
  const shape = new Signal(0); // bumped on any structural change; enumerations subscribe to it
  const pending = new Map<string, any>();
  const listeners = new Set<(p: Patch) => void>();
  const nsCache = new Map<string, any>();
  const arrCache = new WeakMap<object, any>();

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
      old?.bump();
    });

  const set = (p: string, v: any): void =>
    batch(() => {
      if (v == null) return remove(p);
      if (isPlain(v)) {
        for (const k of [...ensureNs(p)]) if (!(k in v)) remove(join(p, k));
        for (const k in v) set(join(p, k), v[k]);
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
      ensureNs(at);
      for (const k in patch) {
        const p = join(at, k);
        const v = patch[k];
        if (v === null) {
          if (!ifMissing) remove(p);
        } else if (isPlain(v)) {
          merge(v, { at: p, ifMissing });
        } else if (!(ifMissing && has(p)) && !(leaves.get(p) instanceof Computed)) {
          set(p, v); // computed leaves are skipped: patches from storage or a server cannot overwrite them
        }
      }
    });

  const has = (p: string): boolean => leaves.has(p) || kids.has(p);

  /** Arrays are returned through a proxy so in-place mutation notifies the leaf. */
  const wrapArray = (raw: any[], s: Signal<any>, p: string): any => {
    let px = arrCache.get(raw);
    if (!px) {
      const touch = () => {
        pending.set(p, raw);
        s.bump();
        return true;
      };
      px = new Proxy(raw, {
        set: (t, k, v) => {
          (t as any)[k] = v;
          return touch();
        },
      });
      arrCache.set(raw, px);
    }
    return px;
  };

  const get = (p: string): any => {
    const s = leaves.get(p);
    if (s) {
      const v = s.value;
      return Array.isArray(v) ? wrapArray(v, s, p) : v;
    }
    if (kids.has(p)) return ns(p);
    shape.value; // subscribe, so creating this path later re-runs the reader
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

  const scope = new Proxy(
    {},
    {
      has: (_, k) => str(k) && k[0] === '$',
      get: (_, k) => (!str(k) ? undefined : k === '$' ? ns('') : get(k.slice(1))),
      set: (_, k, v) => {
        if (str(k)) k === '$' ? merge(v) : set(k.slice(1), v);
        return true;
      },
    },
  );

  const paths = (filter?: Filter): string[] => {
    shape.value;
    return [...leaves.keys()].filter(toPredicate(filter));
  };

  const snapshot = (filter?: Filter, { at = '', computed = true } = {}): Patch => {
    shape.value;
    const ok = toPredicate(filter);
    const out: Patch = {};
    const rel = (p: string) => (at ? p.slice(at.length + 1) : p);
    for (const [p, s] of leaves)
      if (under(p, at) && ok(p) && (computed || !(s instanceof Computed))) expand(out, rel(p), s.value);
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
    scope,
  };
};

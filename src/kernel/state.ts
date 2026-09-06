// Path-keyed signal store with JSON merge-patch semantics. No DOM dependency.
import { Computed, Signal, batch, onSettled } from './reactive.js'
import { expand, isPlain, toPredicate, type Filter } from '../lib/objects.js'

export type Patch = Record<string, any>

export interface Store {
  /** Value at a dotted path: a leaf value, a namespace proxy, or undefined. Reads subscribe. */
  get(path: string): any
  /** Replace the value at a path. Plain objects become namespaces; null/undefined removes. */
  set(path: string, value: any): void
  /** JSON merge-patch (RFC 7396): objects merge, null removes, everything else replaces. */
  merge(patch: Patch, options?: { at?: string; ifMissing?: boolean }): void
  remove(path: string): void
  has(path: string): boolean
  /** Install a computed (or any signal) as the leaf at a path. */
  define(path: string, node: Signal<any>): void
  /** Leaf paths, optionally filtered. */
  paths(filter?: Filter): string[]
  /** Plain-object copy of the store or a namespace. */
  snapshot(filter?: Filter, options?: { at?: string; computed?: boolean }): Patch
  /** Called after each settled batch with the nested object of changed paths (null = removed). */
  onPatch(fn: (patch: Patch) => void): () => void
  /** Root namespace proxy: `$.count`, `$.user.name = 'x'`, `JSON.stringify($)`. */
  readonly $: any
  /** Identifier scope for compiled expressions: resolves `$count`, `$user`, and `$`. */
  readonly scope: object
}

const parentOf = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf('.')))
const nameOf = (p: string): string => p.slice(p.lastIndexOf('.') + 1)
const join = (a: string, b: string): string => (a ? `${a}.${b}` : b)
const under = (p: string, at: string): boolean => !at || p === at || p.startsWith(`${at}.`)

export const createStore = (): Store => {
  const leaves = new Map<string, Signal<any>>()
  const kids = new Map<string, Set<string>>([['', new Set()]])
  const shape = new Signal(0) // bumped on any structural change; enumerations subscribe to it
  const pending = new Map<string, any>()
  const listeners = new Set<(p: Patch) => void>()
  const nsCache = new Map<string, any>()
  const arrCache = new WeakMap<object, any>()

  const ensureNs = (p: string): Set<string> => {
    let set = kids.get(p)
    if (!set) {
      if (leaves.has(p)) dropLeaf(p)
      kids.set(p, (set = new Set()))
      ensureNs(parentOf(p)).add(nameOf(p))
      shape.bump()
    }
    return set
  }

  const dropLeaf = (p: string): void => {
    const s = leaves.get(p)
    if (!s) return
    leaves.delete(p)
    kids.get(parentOf(p))?.delete(nameOf(p))
    pending.set(p, null)
    s.bump()
    shape.bump()
  }

  const dropNs = (p: string): void => {
    const set = kids.get(p)
    if (!set) return
    for (const k of [...set]) remove(join(p, k))
    if (p) {
      kids.delete(p)
      kids.get(parentOf(p))?.delete(nameOf(p))
      nsCache.delete(p)
    }
    shape.bump()
  }

  const remove = (p: string): void =>
    batch(() => {
      dropLeaf(p)
      dropNs(p)
    })

  const define = (p: string, node: Signal<any>): void =>
    batch(() => {
      if (kids.has(p)) dropNs(p)
      const old = leaves.get(p)
      leaves.set(p, node)
      ensureNs(parentOf(p)).add(nameOf(p))
      old?.bump()
      shape.bump()
    })

  const set = (p: string, v: any): void =>
    batch(() => {
      if (v == null) return remove(p)
      if (isPlain(v)) {
        const names = ensureNs(p)
        for (const k of [...names]) if (!(k in v)) remove(join(p, k))
        for (const k in v) set(join(p, k), v[k])
        return
      }
      if (kids.has(p)) dropNs(p)
      const s = leaves.get(p)
      if (s instanceof Computed) throw new Error(`"${p}" is a computed signal and cannot be assigned`)
      if (s) {
        if (Object.is(s.peek(), v)) return
        s.value = v
      } else {
        define(p, new Signal(v))
      }
      pending.set(p, v)
    })

  const merge = (patch: Patch, { at = '', ifMissing = false } = {}): void =>
    batch(() => {
      if (!isPlain(patch)) return
      ensureNs(at)
      for (const k in patch) {
        const p = join(at, k)
        const v = patch[k]
        if (v === null) {
          if (!ifMissing) remove(p)
        } else if (isPlain(v)) {
          merge(v, { at: p, ifMissing })
        } else if (!(ifMissing && (leaves.has(p) || kids.has(p))) && !(leaves.get(p) instanceof Computed)) {
          set(p, v) // computed leaves are skipped: patches from storage or a server cannot overwrite them
        }
      }
    })

  /** Arrays are returned through a proxy so in-place mutation notifies the leaf. */
  const wrapArray = (raw: any[], s: Signal<any>, p: string): any => {
    let px = arrCache.get(raw)
    if (!px) {
      const touch = () => {
        pending.set(p, raw)
        s.bump()
      }
      px = new Proxy(raw, {
        set: (t, k, v) => ((t as any)[k] = v, touch(), true),
        deleteProperty: (t, k) => (delete (t as any)[k], touch(), true),
      })
      arrCache.set(raw, px)
    }
    return px
  }

  const get = (p: string): any => {
    const s = leaves.get(p)
    if (s) {
      const v = s.value
      return Array.isArray(v) ? wrapArray(v, s, p) : v
    }
    if (kids.has(p)) return ns(p)
    shape.value // subscribe, so creating this path later re-runs the reader
    return undefined
  }

  const ns = (p: string): any => {
    let px = nsCache.get(p)
    if (!px) {
      const names = () => (shape.value, kids.get(p))
      px = new Proxy(Object.create(null), {
        get: (_, k) =>
          typeof k !== 'string' ? undefined : k === 'toJSON' ? () => snapshot(undefined, { at: p }) : get(join(p, k)),
        set: (_, k, v) => (typeof k === 'string' && set(join(p, k), v), true),
        deleteProperty: (_, k) => (typeof k === 'string' && remove(join(p, k)), true),
        has: (_, k) => typeof k === 'string' && !!names()?.has(k),
        ownKeys: () => [...(names() ?? [])],
        getOwnPropertyDescriptor: (_, k) =>
          typeof k === 'string' && names()?.has(k)
            ? { enumerable: true, configurable: true, writable: true, value: get(join(p, k)) }
            : undefined,
      })
      nsCache.set(p, px)
    }
    return px
  }

  const scope = new Proxy(Object.create(null), {
    has: (_, k) => typeof k === 'string' && k[0] === '$',
    get: (_, k) => (typeof k !== 'string' ? undefined : k === '$' ? ns('') : get(k.slice(1))),
    set: (_, k, v) => {
      if (typeof k === 'string') k === '$' ? merge(v) : set(k.slice(1), v)
      return true
    },
  })

  const paths = (filter?: Filter): string[] => {
    shape.value
    const ok = toPredicate(filter)
    return [...leaves.keys()].filter(ok)
  }

  const snapshot = (filter?: Filter, { at = '', computed = true } = {}): Patch => {
    shape.value
    const ok = toPredicate(filter)
    const out: Patch = {}
    const rel = (p: string) => (at ? p.slice(at.length + 1) : p)
    for (const [p, s] of leaves) {
      if (!under(p, at) || !ok(p) || (!computed && s instanceof Computed)) continue
      expand(out, rel(p), s.value)
    }
    // Empty namespaces still appear as `{}`.
    for (const p of kids.keys()) {
      if (p && p !== at && under(p, at) && ok(p) && !kids.get(p)!.size) expand(out, rel(p), {})
    }
    return out
  }

  onSettled(() => {
    if (!pending.size) return
    const patch: Patch = {}
    for (const [p, v] of pending) expand(patch, p, v)
    pending.clear()
    for (const fn of listeners) fn(patch)
  })

  return {
    get,
    set,
    merge,
    remove,
    has: (p) => leaves.has(p) || kids.has(p),
    define,
    paths,
    snapshot,
    onPatch: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    get $() {
      return ns('')
    },
    scope,
  }
}

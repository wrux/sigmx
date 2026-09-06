import { attribute, expand, toPredicate } from '../../kernel/index.js'

const parse = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Keeps signals and the URL query string in step.
 *
 * Keyed form declares one signal with a default: `query-string:page="1"` creates `page`, reads
 * `?page=` on load when present (otherwise uses the default), writes it whenever it changes, and
 * drops the parameter again when the value is back at the default. The parameter name is the key
 * as written; the signal name is recased as usual.
 *
 * Bare form syncs existing signals: `query-string="{ include: /^(q|sort)$/ }"` mirrors matching
 * paths both ways. `__history` pushes an entry per change and restores on back/forward;
 * `__filter` drops empty values from the URL.
 */
export const queryString = attribute({
  name: 'query-string',
  mount({ key, value, mods, evaluate, cased, store, listen, effect }) {
    const history = mods.has('history')
    const push = (url: string) => {
      if (url !== location.pathname + location.search + location.hash) window.history[history ? 'pushState' : 'replaceState'](null, '', url)
    }
    const urlWith = (q: URLSearchParams) => `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`
    let restoring = false
    const restore = (fn: () => void) => {
      restoring = true
      try {
        fn()
      } finally {
        restoring = false
      }
    }

    if (key) {
      const path = cased()
      const fallback = value ? evaluate() : ''
      const fromUrl = () => {
        const raw = new URLSearchParams(location.search).get(key)
        store.set(path, raw === null ? fallback : parse(raw))
      }
      if (!store.has(path) || new URLSearchParams(location.search).has(key)) fromUrl()
      effect(() => {
        const v = store.get(path)
        if (restoring) return
        const q = new URLSearchParams(location.search)
        if (v === undefined || same(v, fallback)) q.delete(key)
        else q.set(key, typeof v === 'string' ? v : JSON.stringify(v))
        push(urlWith(q))
      })
      if (history) listen(window, 'popstate', () => restore(fromUrl))
      return
    }

    const filter = value ? evaluate() : undefined
    const ok = toPredicate(filter)
    const fromUrl = () => {
      const patch = {}
      for (const [k, v] of new URLSearchParams(location.search)) if (ok(k)) expand(patch, k, parse(v))
      store.merge(patch)
    }
    fromUrl()
    effect(() => {
      const snap = store.snapshot(filter, { computed: false })
      if (restoring) return
      const q = new URLSearchParams(location.search)
      const walk = (obj: Record<string, any>, prefix: string) => {
        for (const k in obj) {
          const p = prefix ? `${prefix}.${k}` : k
          const v = obj[k]
          if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p)
          else if (mods.has('filter') && (v === '' || v == null)) q.delete(p)
          else q.set(p, typeof v === 'string' ? v : JSON.stringify(v))
        }
      }
      walk(snap, '')
      push(urlWith(q))
    })
    if (history) listen(window, 'popstate', () => restore(fromUrl))
  },
})

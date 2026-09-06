import { attribute, expand } from '../../kernel/index.js'

const parse = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

/**
 * Two-way sync between matching signals and the URL query string. `__history` pushes an entry per
 * change and restores on back/forward; `__filter` drops empty values from the URL.
 */
export const queryString = attribute({
  name: 'query-string',
  key: 'forbidden',
  mount({ value, mods, evaluate, store, listen, effect }) {
    const filter = value ? evaluate() : undefined
    const history = mods.has('history')
    const fromUrl = () => {
      const patch = {}
      for (const [k, v] of new URLSearchParams(location.search)) expand(patch, k, parse(v))
      store.merge(store.snapshot(filter, { computed: false }) && patch)
    }
    let syncing = false
    fromUrl()
    effect(() => {
      const snap = store.snapshot(filter, { computed: false })
      if (syncing) return
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
      const url = `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`
      if (url === location.pathname + location.search + location.hash) return
      history ? window.history.pushState(null, '', url) : window.history.replaceState(null, '', url)
    })
    if (history)
      listen(window, 'popstate', () => {
        syncing = true
        try {
          fromUrl()
        } finally {
          syncing = false
        }
      })
  },
})

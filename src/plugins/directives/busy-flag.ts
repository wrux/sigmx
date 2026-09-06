import { attribute } from '../../kernel/index.js'

/** A boolean signal that is true while a request started from this element (or one inside it) is in flight. */
export const indicator = attribute({
  name: 'indicator',
  mount({ el, key, value, cased, store, listen }) {
    const path = key ? cased() : value.trim()
    let active = 0
    store.set(path, false)
    listen(document, 'sigmx-fetch', (e: CustomEvent<{ el: Element; type: string }>) => {
      if (e.detail.el !== el && !el.contains(e.detail.el)) return
      if (e.detail.type === 'started') active++
      else if (e.detail.type === 'finished') active = Math.max(0, active - 1)
      store.set(path, active > 0)
    })
    return () => store.set(path, false)
  },
})

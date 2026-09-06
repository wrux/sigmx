import { attribute } from '../../kernel/index.js'

/** Stores the element in a signal: `ref:dialog` or `ref="dialog"`. */
export const ref = attribute({
  name: 'ref',
  mount({ el, key, value, cased, store }) {
    const path = key ? cased() : value.trim()
    store.set(path, el)
    return () => store.remove(path)
  },
})

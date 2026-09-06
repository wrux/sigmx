import { attribute } from '../../kernel/index.js'

/** `class:active="expr"` or `class="{ active: expr, 'a b': expr }"`. */
export const className = attribute({
  name: 'class',
  value: 'required',
  mount({ el, key, cased, evaluate, effect }) {
    const applied = new Set<string>()
    effect(() => {
      const map: Record<string, unknown> = key ? { [cased('kebab')]: evaluate() } : evaluate()
      for (const k in map) {
        for (const name of k.split(/\s+/).filter(Boolean)) {
          el.classList.toggle(name, !!map[k])
          map[k] ? applied.add(name) : applied.delete(name)
        }
      }
    })
    return () => el.classList.remove(...applied)
  },
})

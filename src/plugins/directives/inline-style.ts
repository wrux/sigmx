import { attribute, kebab } from '../../kernel/index.js'

/** `style:color="expr"` or `style="{ color: expr }"`. Falsy values (except 0) restore the original. */
export const style = attribute({
  name: 'style',
  value: 'required',
  mount({ el, key, cased, evaluate, effect }) {
    const original = new Map<string, string>()
    const put = (prop: string, v: unknown) => {
      if (!original.has(prop)) original.set(prop, el.style.getPropertyValue(prop))
      if (v || v === 0) el.style.setProperty(prop, String(v))
      else el.style.setProperty(prop, original.get(prop)!)
    }
    effect(() => {
      const map: Record<string, unknown> = key ? { [cased('kebab')]: evaluate() } : evaluate()
      for (const prop of original.keys()) if (!(prop in map)) put(prop, '')
      for (const prop in map) put(kebab(prop), map[prop])
    })
    return () => {
      for (const [prop, v] of original) el.style.setProperty(prop, v)
    }
  },
})

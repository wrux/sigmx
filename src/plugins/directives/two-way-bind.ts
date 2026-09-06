import { attribute } from '../../kernel/index.js'

type Adapter = { read(): unknown; write(v: unknown): void; events: string[] }

const readFiles = (input: HTMLInputElement) =>
  Promise.all(
    [...(input.files ?? [])].map(
      (f) =>
        new Promise<{ name: string; type: string; size: number; contents: string }>((resolve) => {
          const r = new FileReader()
          r.onloadend = () =>
            resolve({ name: f.name, type: f.type, size: f.size, contents: String(r.result).split(',')[1] ?? '' })
          r.readAsDataURL(f)
        }),
    ),
  )

/**
 * Two-way binding: `bind:name` or `bind="name"`. Creates the signal from the element when missing.
 * Checkbox groups bind to arrays, radios to the checked value, `select multiple` to arrays.
 * `__prop.value` binds a custom element property; `__event.change` picks the events to listen for.
 */
export const bind = attribute({
  name: 'bind',
  mount({ el, key, value, cased, mods, store, listen, effect }) {
    const path = key ? cased() : value.trim()
    const current = () => store.get(path)
    const asNumber = (s: string) => (typeof current() === 'number' ? +s : s)
    let a: Adapter
    const prop = mods.get('prop')?.[0]

    if (prop) {
      a = { read: () => (el as any)[prop], write: (v) => ((el as any)[prop] = v), events: ['input', 'change'] }
    } else if (el instanceof HTMLInputElement) {
      const t = el.type
      if (t === 'checkbox') {
        const own = el.hasAttribute('value') && el.value !== 'on'
        a = {
          read: () => {
            const cur = current()
            if (Array.isArray(cur)) {
              const set = new Set(cur)
              el.checked ? set.add(el.value) : set.delete(el.value)
              return [...set]
            }
            return own ? (el.checked ? el.value : '') : el.checked
          },
          write: (v) => {
            el.checked = Array.isArray(v) ? v.includes(el.value) : own ? v === el.value : !!v
          },
          events: ['input'],
        }
      } else if (t === 'radio') {
        if (!el.name) el.name = path
        a = { read: () => (el.checked ? asNumber(el.value) : current()), write: (v) => (el.checked = String(v) === el.value), events: ['input'] }
      } else if (t === 'file') {
        listen(el, 'change', () => readFiles(el).then((files) => store.set(path, files)))
        return
      } else if (t === 'number' || t === 'range') {
        a = { read: () => (el.value === '' ? '' : +el.value), write: (v) => (el.value = String(v ?? '')), events: ['input'] }
      } else {
        a = { read: () => el.value, write: (v) => (el.value = String(v ?? '')), events: ['input'] }
      }
    } else if (el instanceof HTMLSelectElement) {
      a = {
        read: () => (el.multiple ? [...el.selectedOptions].map((o) => asNumber(o.value)) : asNumber(el.value)),
        write: (v) => {
          if (el.multiple) for (const o of el.options) o.selected = Array.isArray(v) && v.map(String).includes(o.value)
          else el.value = String(v ?? '')
        },
        events: ['change'],
      }
    } else if (el instanceof HTMLTextAreaElement || 'value' in el) {
      a = { read: () => (el as any).value, write: (v) => ((el as any).value = String(v ?? '')), events: ['input', 'change'] }
    } else {
      a = { read: () => el.getAttribute('value'), write: (v) => el.setAttribute('value', String(v ?? '')), events: ['change'] }
    }

    if (!store.has(path)) {
      const initial = a.read()
      if (initial !== undefined && initial !== '') store.set(path, initial)
    }
    const sync = () => store.set(path, a.read())
    for (const type of mods.get('event') ?? a.events) listen(el, type, sync)
    listen(el, 'sigmx-prop-change', sync)
    effect(() => {
      const v = current()
      if (v !== undefined) a.write(v)
    })
  },
})

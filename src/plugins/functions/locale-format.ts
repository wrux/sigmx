import { action } from '../../kernel/index.js'

type Fmt = (locale: string | string[] | undefined, value: any, options: any) => string
const formats: Record<string, Fmt> = {
  number: (l, v, o) => new Intl.NumberFormat(l, o).format(v),
  datetime: (l, v, o) => new Intl.DateTimeFormat(l, o).format(v),
  pluralRules: (l, v, o) => new Intl.PluralRules(l, o).select(v),
  relativeTime: (l, v, o) => new Intl.RelativeTimeFormat(l, o).format(v[0], v[1]),
  list: (l, v, o) => new Intl.ListFormat(l, o).format(v),
  displayNames: (l, v, o) => new Intl.DisplayNames(l, o).of(v) ?? '',
}

/** `@intl('number', 1234.5, { style: 'currency', currency: 'USD' }, 'en-US')`. */
export const intl = action({
  name: 'intl',
  call: ({ error }, type: string, value: unknown, options?: Record<string, unknown>, locale?: string | string[]) => {
    const f = formats[type]
    if (!f) throw error(`unknown @intl type "${type}"`)
    return f(locale, value, options)
  },
})

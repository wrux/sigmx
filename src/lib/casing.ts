export type CaseStyle = 'camel' | 'kebab' | 'snake' | 'pascal'

/** Split an identifier in any common casing into lowercase words. */
const words = (s: string): string[] =>
  s
    .replace(/([a-z0-9])([A-Z])|([A-Z]+)([A-Z][a-z])/g, '$1$3 $2$4')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())

const cap = (w: string): string => w[0].toUpperCase() + w.slice(1)

export const kebab = (s: string): string => words(s).join('-')
export const snake = (s: string): string => words(s).join('_')
export const camel = (s: string): string => words(s).map((w, i) => (i ? cap(w) : w)).join('')
export const pascal = (s: string): string => words(s).map(cap).join('')

const styles = { camel, kebab, snake, pascal }

/** Recase a dotted path segment by segment so `user.first-name` becomes `user.firstName`. */
export const recase = (path: string, style: CaseStyle): string => path.split('.').map(styles[style]).join('.')

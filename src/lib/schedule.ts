export type Mods = Map<string, string[]>
type Fn = (...args: any[]) => void

/** '300ms' → 300, '2s' → 2000, '150' → 150. */
export const toMs = (args: string[] | undefined, fallback = 0): number => {
  for (const a of args ?? []) {
    const m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(a)
    if (m) return +m[1] * (m[2] === 's' ? 1000 : 1)
  }
  return fallback
}

export const delay = (fn: Fn, ms: number): Fn => (...args) => void setTimeout(fn, ms, ...args)

/** Debounce: wait for a quiet period. `leading` fires on the first call, `trailing` on the last. */
export const debounce = (fn: Fn, ms: number, leading = false, trailing = true): Fn => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let last: any[] | undefined
  return (...args) => {
    if (timer) clearTimeout(timer)
    else if (leading) fn(...args)
    last = args
    timer = setTimeout(() => {
      timer = undefined
      if (trailing && last) fn(...last)
      last = undefined
    }, ms)
  }
}

/** Throttle: at most one call per window. `leading` fires immediately, `trailing` fires once at the end. */
export const throttle = (fn: Fn, ms: number, leading = true, trailing = false): Fn => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let last: any[] | undefined
  return (...args) => {
    if (timer) {
      last = args
      return
    }
    if (leading) fn(...args)
    else last = args
    timer = setTimeout(() => {
      timer = undefined
      if (trailing && last) fn(...last)
      last = undefined
    }, ms)
  }
}

/** Apply `__delay`, `__debounce` and `__throttle` modifiers to a callback. */
export const withTiming = (fn: Fn, mods: Mods): Fn => {
  const d = mods.get('delay')
  if (d) fn = delay(fn, toMs(d))
  const db = mods.get('debounce')
  if (db) fn = debounce(fn, toMs(db, 300), db.includes('leading'), !db.includes('notrailing'))
  const th = mods.get('throttle')
  if (th) fn = throttle(fn, toMs(th, 300), !th.includes('noleading'), th.includes('trailing'))
  return fn
}

/** Wrap a callback in `document.startViewTransition` when `__viewtransition` is present and supported. */
export const withViewTransition = (fn: Fn, mods: Mods): Fn =>
  mods.has('viewtransition') && 'startViewTransition' in document
    ? (...args) => void document.startViewTransition(() => fn(...args))
    : fn

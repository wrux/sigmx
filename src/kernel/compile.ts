// Expression compiler. Signals need no rewriting: the body runs inside `with (scope)`, where
// `$count`, `$user.name` and `$` resolve through the store's scope proxy. Only `@action(` is
// rewritten, into a call on the per-evaluation actions object.

import type { ExpressionCompiler } from './contracts.js'

export type Compiler = (params: string[], body: string) => (...args: any[]) => any

/** Default compiler: `new Function`. Not usable under a strict CSP; see `cspCompiler`. */
export const functionCompiler: Compiler = (params, body) => Function(...params, body) as (...args: any[]) => any

const cache = new Map<string, (...args: any[]) => any>()

const isIdent = (c: string): boolean => /[A-Za-z0-9_$]/.test(c)

/** Walk source text, skipping string, template and comment contents; `emit` receives code chars. */
const scan = (src: string, onCode: (c: string, i: number) => number | void): void => {
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1
      onCode(src.slice(i, j + 1), i)
      i = j + 1
    } else if (c === '/' && next === '/') {
      const j = src.indexOf('\n', i)
      i = j < 0 ? n : j
    } else if (c === '/' && next === '*') {
      const j = src.indexOf('*/', i + 2)
      i = j < 0 ? n : j + 2
    } else {
      const skip = onCode(c, i)
      i += skip || 1
    }
  }
}

/** Replace `@name(` with `__a.name(` outside strings and comments. */
export const rewriteActions = (src: string): string => {
  let out = ''
  scan(src, (c, i) => {
    if (c === '@') {
      let j = i + 1
      while (j < src.length && isIdent(src[j])) j++
      let k = j
      while (k < src.length && /\s/.test(src[k])) k++
      if (j > i + 1 && src[k] === '(') {
        out += `__a.${src.slice(i + 1, j)}(`
        return k + 1 - i
      }
    }
    out += c
  })
  return out
}

/** Split on top-level semicolons. */
export const splitStatements = (src: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  scan(src, (c, i) => {
    if (c.length > 1) return
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (c === ';' && !depth) {
      parts.push(src.slice(start, i))
      start = i + 1
    }
  })
  parts.push(src.slice(start))
  return parts.filter((p) => p.trim())
}

/**
 * Compile an expression to `(store, actions, ...params) => any`: the body runs inside
 * `with (store.scope)`, so `$name` resolves through the store. With `returns`, the value of the
 * last statement is returned, so `$a = 1; $a * 2` works. Compiled functions are cached by source.
 */
export const compile = (
  compiler: Compiler,
  src: string,
  params: string[],
  returns: boolean,
): ((...args: any[]) => any) => {
  const key = `${+returns}|${params.join()}|${src}`
  const hit = cache.get(key)
  if (hit) return hit
  const code = rewriteActions(src.trim())
  const make = (body: string) => compiler(['$', '__a', ...params], `with($.scope){${body}\n}`)
  let fn: (...args: any[]) => any
  if (!returns) {
    fn = make(code)
  } else {
    try {
      fn = make(`return(${code}\n)`)
    } catch {
      const parts = splitStatements(code)
      const last = parts.pop() ?? ''
      try {
        fn = make(`${parts.join(';')};return(${last}\n)`)
      } catch {
        fn = make(code)
      }
    }
  }
  cache.set(key, fn)
  return fn
}

/** The default pipeline: compile at runtime inside `with (scope)` using `compiler` (`new Function` or CSP). */
export const runtimeExpressions =
  (compiler: Compiler): ExpressionCompiler =>
  (src, params, returns) =>
    compile(compiler, src, params, returns)

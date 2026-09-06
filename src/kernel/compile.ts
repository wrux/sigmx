// Expression compiler. Signals need no rewriting: the body runs inside `with (scope)`, where
// `$count`, `$user.name` and `$` resolve through the store's scope proxy. Only `@action(` is
// rewritten, into a call on the per-evaluation actions object.

import type { ExpressionCompiler } from './contracts.js';

export type Compiler = (params: string[], body: string) => (...args: any[]) => any;

/** Default compiler: `new Function`. Not usable under a strict CSP; see `cspCompiler`. */
export const functionCompiler: Compiler = (params, body) => Function(...params, body) as (...args: any[]) => any;

const cache = new Map<string, (...args: any[]) => any>();

/**
 * Replace `@name(` with `__a.name(` outside string literals, including inside the `${…}` holes of
 * template literals. (Inside a comment the rewrite is harmless.)
 */
export const rewriteActions = (src: string): string =>
  src.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|`((?:[^`\\]|\\.)*)`|@([A-Za-z_$][\w$]*)\s*\(/g,
    (m, quoted, tpl, name) =>
      quoted
        ? m
        : tpl !== undefined
          ? `\`${tpl.replace(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_: string, e: string) => `\${${rewriteActions(e)}}`)}\``
          : `__a.${name}(`,
  );

/** Split on top-level semicolons, skipping strings and comments. Used by the build-time precompiler. */
export const splitStatements = (src: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      i = j + 1;
    } else if (c === '/' && next === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
    } else if (c === '/' && next === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
    } else {
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === ';' && !depth) {
        parts.push(src.slice(start, i));
        start = i + 1;
      }
      i++;
    }
  }
  parts.push(src.slice(start));
  return parts.filter((p) => p.trim());
};

/**
 * Compile an expression to `(store, actions, ...params) => any`: the body runs inside
 * `with (store.scope)`, so `$name` resolves through the store. With `returns`, a single expression's
 * value is returned; several statements run for their effects. Compiled functions are cached by source.
 */
export const compile = (
  compiler: Compiler,
  src: string,
  params: string[],
  returns: boolean,
): ((...args: any[]) => any) => {
  const key = `${+returns}|${params.join()}|${src}`;
  let fn = cache.get(key);
  if (!fn) {
    const code = rewriteActions(src.trim());
    const make = (body: string) => compiler(['$', '__a', ...params], `with($.scope){${body}\n}`);
    const attempt = (body: string) => {
      try {
        fn = make(body);
      } catch {}
    };
    if (returns) {
      attempt(`return(${code}\n)`);
    }
    fn ??= make(code);
    cache.set(key, fn);
  }
  return fn;
};

/** The default pipeline: compile at runtime inside `with (scope)` using `compiler` (`new Function` or CSP). */
export const runtimeExpressions =
  (compiler: Compiler): ExpressionCompiler =>
  (src, params, returns) =>
    compile(compiler, src, params, returns);

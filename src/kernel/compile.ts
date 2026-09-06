// Expression compiler. An attribute expression is rewritten once, `$name` → `$.name` and
// `@name(` → `__a.name(`, then compiled as a strict-mode function of `($, __a, el, evt, ...args)`
// where `$` is the store's root proxy. The build-time precompiler emits exactly the same bodies,
// so precompiled and runtime expressions behave identically.

import type { ExpressionCompiler } from './contracts.js';

export type Compiler = (params: string[], body: string) => (...args: any[]) => any;

/** Default compiler: `new Function`. Not usable under a strict CSP; see `cspCompiler`. */
export const functionCompiler: Compiler = (params, body) => Function(...params, body) as (...args: any[]) => any;

const START = /[A-Za-z_$]/;
const IDENT = /[\w$]/;
/** After these a `/` starts a regular expression rather than a division. */
const BEFORE_REGEX = /(^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|do|else|void|delete|throw|new))$/;

/**
 * Tokenizer-based rewrite. Copies string literals, template text, and regular expressions verbatim,
 * drops comments, recurses into `${…}` holes, and rewrites signals and actions in code. In hole
 * mode it stops at the unmatched `}` and reports the index after it.
 */
const rewrite = (src: string, from: number, hole: boolean): [string, number] => {
  let out = '';
  let i = from;
  let depth = 0;
  const n = src.length;
  const code = () => out.trimEnd();
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '`') {
      out += c;
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
        } else if (src[i] === '$' && src[i + 1] === '{') {
          const [inner, j] = rewrite(src, i + 2, true);
          out += `\${${inner}}`;
          i = j;
        } else out += src[i++];
      }
      out += '`';
      i++;
    } else if (c === '/' && d === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
    } else if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
    } else if (c === '/' && BEFORE_REGEX.test(code())) {
      let j = i + 1;
      let cls = false;
      for (; j < n && (cls || src[j] !== '/'); j++) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
      }
      for (j++; j < n && /[a-z]/i.test(src[j]); j++);
      out += src.slice(i, j);
      i = j;
    } else if (hole && (c === '{' || c === '}')) {
      if (c === '{') depth++;
      else if (depth) depth--;
      else return [out, i + 1];
      out += c;
      i++;
    } else if (c === '$' && START.test(d ?? '') && d !== '$' && !IDENT.test(out.at(-1) ?? '')) {
      const before = code();
      // `obj.$x` is a member access and stays; `...$x` is a spread and is a signal.
      if (before.endsWith('.') && !before.endsWith('...')) {
        out += c;
        i++;
        continue;
      }
      let j = i + 1;
      while (j < n && IDENT.test(src[j])) j++;
      out += `$.${src.slice(i + 1, j)}`;
      i = j;
    } else if (c === '@' && START.test(d ?? '')) {
      let j = i + 1;
      while (j < n && IDENT.test(src[j])) j++;
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === '(') {
        out += `__a.${src.slice(i + 1, j)}(`;
        i = k + 1;
      } else {
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return [out, i];
};

/** `$count + @fit($x)` → `$.count + __a.fit($.x)`; strings, template text, comments and regexes untouched. */
export const transform = (src: string): string => rewrite(src, 0, false)[0];

/**
 * The strict-mode bodies to try, best first: the whole source as an expression, then each split at a
 * top-level-looking `;` from the end (statements followed by a returned value), then plain statements.
 * A split inside a string or bracket does not compile and the next candidate is tried.
 */
const candidates = (code: string): string[] => {
  const out = [`return(${code}\n)`];
  for (let i = code.lastIndexOf(';'); i >= 0; i = code.lastIndexOf(';', i - 1))
    out.push(`${code.slice(0, i)};return(${code.slice(i + 1)}\n)`);
  out.push(code);
  return out.map((b) => `"use strict";${b}`);
};

/**
 * Compile `src` with `compiler` as `($, __a, ...params) => any`, returning the body that compiled
 * together with the function. Shared by the runtime and the build-time precompiler.
 */
export const compileBody = (compiler: Compiler, src: string, params: string[]): [string, (...args: any[]) => any] => {
  let error: unknown;
  for (const body of candidates(transform(src.trim()))) {
    try {
      return [body, compiler(['$', '__a', ...params], body)];
    } catch (e) {
      error = e;
    }
  }
  throw error;
};

const cache = new Map<string, (...args: any[]) => any>();
const CACHE_LIMIT = 2000; // a long-lived page streaming unique expressions must not grow without bound

/** Compile with a cache keyed by parameter names and source. */
export const compile = (compiler: Compiler, src: string, params: string[]): ((...args: any[]) => any) => {
  const key = `${params.join()}|${src}`;
  let fn = cache.get(key);
  if (!fn) {
    fn = compileBody(compiler, src, params)[1];
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, fn);
  }
  return fn;
};

/** The default pipeline: compile at runtime with `compiler` (`new Function` or the CSP compiler). */
export const runtimeExpressions =
  (compiler: Compiler): ExpressionCompiler =>
  (src, params) => {
    const fn = compile(compiler, src, params);
    return (store, actions, ...rest) => fn(store.$, actions, ...rest);
  };

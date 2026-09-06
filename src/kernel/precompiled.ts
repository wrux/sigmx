import type { Evaluator, ExpressionCompiler } from './contracts.js';

export type ExpressionTable = Record<string, (root: any, actions: any, el: any, evt: any, ...args: any[]) => any>;

/**
 * Key used by the build plugin and the lookup: the trimmed source text. Parameter names are not part
 * of it, so a plugin gaining an argument (arguments are only ever appended) keeps old tables valid.
 */
export const expressionKey = (src: string): string => src.trim();

/**
 * Look expressions up in a table generated at build time (see `sigmx/precompile`). Table functions
 * take the root store proxy as `$`, exactly like runtime-compiled ones. Pass a `fallback` (for example
 * `runtimeExpressions(functionCompiler)`) for markup assembled at runtime; omit it and the runtime
 * compiler is not bundled at all.
 */
export const precompiled =
  (table: ExpressionTable, fallback?: ExpressionCompiler, onMiss?: (src: string) => void): ExpressionCompiler =>
  (src, params) => {
    const fn = table[expressionKey(src)];
    if (fn) return ((store, actions, ...rest) => fn(store.$, actions, ...rest)) as Evaluator;
    onMiss?.(src);
    if (!fallback) throw new Error(`expression not precompiled: ${src}`);
    return fallback(src, params);
  };

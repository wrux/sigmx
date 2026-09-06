import type { Evaluator, ExpressionCompiler } from './contracts.js';

export type ExpressionTable = Record<string, (root: any, actions: any, el: any, evt: any, ...args: any[]) => any>;

/** Key used by the build plugin and the lookup: returns flag, parameter names, trimmed source. */
export const expressionKey = (src: string, params: string[], returns: boolean): string =>
  `${+returns}|${params.join()}|${src.trim()}`;

/**
 * Look expressions up in a table generated at build time (see `sigmx/precompile`). Precompiled functions
 * receive the root store proxy as `$` instead of a `with` scope. Pass a `fallback` (for example
 * `runtimeExpressions(functionCompiler)`) for markup assembled at runtime; omit it and the runtime
 * compiler is not bundled at all.
 */
export const precompiled =
  (table: ExpressionTable, fallback?: ExpressionCompiler, onMiss?: (src: string) => void): ExpressionCompiler =>
  (src, params, returns) => {
    const fn = table[expressionKey(src, params, returns)];
    if (fn) return ((store, actions, el, evt, ...args) => fn(store.$, actions, el, evt, ...args)) as Evaluator;
    onMiss?.(src);
    if (!fallback) throw new Error(`expression not precompiled: ${src}`);
    return fallback(src, params, returns);
  };

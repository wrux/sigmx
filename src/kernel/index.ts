export { camel, kebab, pascal, recase, snake } from '../lib/casing.js';
export type { Filter } from '../lib/objects.js';
export { expand, isPlain, toPredicate } from '../lib/objects.js';
export { debounce, delay, throttle, toMs, withTiming, withViewTransition } from '../lib/schedule.js';
export type { Compiler } from './compile.js';
export { compile, functionCompiler, rewriteActions, runtimeExpressions, splitStatements } from './compile.js';
export type * from './contracts.js';
export type { ExpressionTable } from './precompiled.js';
export { expressionKey, precompiled } from './precompiled.js';
export { batch, Computed, computed, effect, flush, onSettled, Signal, signal, untracked } from './reactive.js';
export { createRuntime, parseAttr } from './runtime.js';
export type { Patch, Store } from './state.js';
export { createStore } from './state.js';

import { functionCompiler, runtimeExpressions } from './compile.js';
import type { ActionPlugin, AttributePlugin, HandlerPlugin, Sigmx, SigmxOptions } from './contracts.js';
import { createRuntime } from './runtime.js';

/** Create an instance. Expressions compile at runtime unless you pass `expressions` (see `precompiled`). */
export const createSigmx = (options: SigmxOptions = {}): Sigmx =>
  createRuntime({
    ...options,
    expressions: options.expressions ?? runtimeExpressions(options.compile ?? functionCompiler),
  });

export const attribute = (p: Omit<AttributePlugin, 'type'>): AttributePlugin => ({ type: 'attribute', ...p });
export const action = (p: Omit<ActionPlugin, 'type'>): ActionPlugin => ({ type: 'action', ...p });
export const handler = (p: Omit<HandlerPlugin, 'type'>): HandlerPlugin => ({ type: 'handler', ...p });

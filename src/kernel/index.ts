export { createRuntime, parseAttr } from './runtime.js'
export { compile, functionCompiler, rewriteActions, runtimeExpressions, splitStatements } from './compile.js'
export { expressionKey, precompiled } from './precompiled.js'
export type { ExpressionTable } from './precompiled.js'
export type { Compiler } from './compile.js'
export { Computed, Signal, batch, computed, effect, flush, onSettled, signal, untracked } from './reactive.js'
export { createStore } from './state.js'
export type { Patch, Store } from './state.js'
export type * from './contracts.js'
export { expand, isPlain, toPredicate } from '../lib/objects.js'
export type { Filter } from '../lib/objects.js'
export { camel, kebab, pascal, recase, snake } from '../lib/casing.js'
export { debounce, delay, throttle, toMs, withTiming, withViewTransition } from '../lib/schedule.js'

import type { ActionPlugin, AttributePlugin, HandlerPlugin, Sigmx, SigmxOptions } from './contracts.js'
import { createRuntime } from './runtime.js'
import { functionCompiler, runtimeExpressions } from './compile.js'

/** Create an instance. Expressions compile at runtime unless you pass `expressions` (see `precompiled`). */
export const createSigmx = (options: SigmxOptions = {}): Sigmx =>
  createRuntime({ ...options, expressions: options.expressions ?? runtimeExpressions(options.compile ?? functionCompiler) })

/** Type a plugin definition. Pure: registration is `createSigmx({ plugins })` or `sigmx.use()`. */
export const attribute = (p: Omit<AttributePlugin, 'type'>): AttributePlugin => ({ type: 'attribute', ...p })
export const action = (p: Omit<ActionPlugin, 'type'>): ActionPlugin => ({ type: 'action', ...p })
export const handler = (p: Omit<HandlerPlugin, 'type'>): HandlerPlugin => ({ type: 'handler', ...p })

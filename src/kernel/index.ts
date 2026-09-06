export { createSigmx, parseAttr } from './runtime.js'
export { compile, functionCompiler, rewriteActions, splitStatements } from './compile.js'
export type { Compiler } from './compile.js'
export { Computed, Signal, batch, computed, effect, flush, onSettled, signal, untracked } from './reactive.js'
export { createStore } from './state.js'
export type { Patch, Store } from './state.js'
export type * from './contracts.js'
export { expand, isPlain, toPredicate } from '../lib/objects.js'
export type { Filter } from '../lib/objects.js'
export { camel, kebab, pascal, recase, snake } from '../lib/casing.js'
export { debounce, delay, throttle, toMs, withTiming, withViewTransition } from '../lib/schedule.js'

import type { ActionPlugin, AttributePlugin, HandlerPlugin } from './contracts.js'

/** Type a plugin definition. Pure: registration is `createSigmx({ plugins })` or `sigmx.use()`. */
export const attribute = (p: Omit<AttributePlugin, 'type'>): AttributePlugin => ({ type: 'attribute', ...p })
export const action = (p: Omit<ActionPlugin, 'type'>): ActionPlugin => ({ type: 'action', ...p })
export const handler = (p: Omit<HandlerPlugin, 'type'>): HandlerPlugin => ({ type: 'handler', ...p })

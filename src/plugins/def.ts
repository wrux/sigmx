// Compact constructors for the built-in plugins. They build the same objects as `attribute()`,
// `action()` and `handler()` from the kernel; the numeric flags keep the bundle small.
import type { ActionPlugin, AttributePlugin, HandlerPlugin } from '../kernel/contracts.js';

/** Flags: 1 key required, 2 key forbidden, 4 value required, 8 value forbidden (documentation only), 16 statement (no return value). */
export const dir = (
  name: string,
  flags: number,
  mount: AttributePlugin['mount'],
  args?: string[],
): AttributePlugin => ({
  type: 'attribute',
  name,
  returns: !(flags & 16),
  args,
  mount,
});
export const act = (name: string, call: ActionPlugin['call']): ActionPlugin => ({ type: 'action', name, call });
export const srv = (name: string, handle: HandlerPlugin['handle']): HandlerPlugin => ({
  type: 'handler',
  name,
  handle,
});

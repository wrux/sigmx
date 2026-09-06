// Compact constructors for the built-in plugins. They build the same objects as `attribute()`,
// `action()` and `handler()` from the kernel; the numeric flags keep the bundle small.
import type { ActionPlugin, AttributePlugin, HandlerPlugin } from '../kernel/contracts.js';

type Rule = 'required' | 'forbidden' | undefined;
const rule = (flags: number, required: number, forbidden: number): Rule =>
  flags & required ? 'required' : flags & forbidden ? 'forbidden' : undefined;

/** Flags: 1 key required, 2 key forbidden, 4 value required, 8 value forbidden, 32 the value is a literal (`__dynamic` opts into an expression). */
export const dir = (
  name: string,
  flags: number,
  mount: AttributePlugin['mount'],
  args?: string[],
): AttributePlugin => ({
  type: 'attribute',
  name,
  key: rule(flags, 1, 2),
  value: rule(flags, 4, 8),
  literal: !!(flags & 32),
  args,
  mount,
});
export const act = (name: string, call: ActionPlugin['call']): ActionPlugin => ({ type: 'action', name, call });
export const srv = (name: string, handle: HandlerPlugin['handle']): HandlerPlugin => ({
  type: 'handler',
  name,
  handle,
});

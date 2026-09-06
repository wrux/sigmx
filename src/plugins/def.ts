// Compact constructors for the built-in plugins. They build the same objects as `attribute()`,
// `action()` and `handler()` from the kernel; the numeric flags keep the bundle small.
import type { ActionPlugin, AttributePlugin, HandlerPlugin } from '../kernel/contracts.js';

type Rule = 'required' | 'forbidden' | undefined;
const rule = (flags: number, required: number, forbidden: number): Rule =>
  flags & required ? 'required' : flags & forbidden ? 'forbidden' : undefined;

/** Flags: 1 key required, 2 key forbidden, 4 value required, 8 value forbidden, 16 statement (no return value). */
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
  returns: !(flags & 16),
  args,
  mount: (ctx) => {
    // Contract checks: a keyed directive without a key would otherwise write to the path ''.
    if (flags & 1 && !ctx.key) throw ctx.error('needs a key');
    if (flags & 2 && ctx.key) throw ctx.error('takes no key');
    if (flags & 4 && !ctx.value) throw ctx.error('needs a value');
    if (flags & 8 && ctx.value) throw ctx.error('takes no value');
    return mount(ctx);
  },
});
export const act = (name: string, call: ActionPlugin['call']): ActionPlugin => ({ type: 'action', name, call });
export const srv = (name: string, handle: HandlerPlugin['handle']): HandlerPlugin => ({
  type: 'handler',
  name,
  handle,
});

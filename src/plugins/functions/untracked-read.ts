import { untracked } from '../../kernel/index.js';
import { act } from '../def.js';

/** `@peek(() => $x)` reads signals without subscribing the surrounding effect. */
export const peek = act('peek', (_, fn: unknown) => (typeof fn === 'function' ? untracked(fn as () => unknown) : fn));

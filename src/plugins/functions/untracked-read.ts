import { action, untracked } from '../../kernel/index.js';

/** `@peek(() => $x)` reads signals without subscribing the surrounding effect. */
export const peek = action({ name: 'peek', call: (_, fn: () => unknown) => untracked(fn) });

import { attribute, withTiming, withViewTransition } from '../../kernel/index.js';

/** Runs once when the element is mounted. Supports `__delay.500ms` and `__viewtransition`. */
export const init = attribute({
  name: 'init',
  key: 'forbidden',
  value: 'required',
  returns: false,
  mount({ mods, evaluate }) {
    withTiming(
      withViewTransition(() => evaluate(), mods),
      mods,
    )();
  },
});

import { attribute, toMs, withViewTransition } from '../../kernel/index.js';

/** `on-interval__duration.5s.leading="expr"`. Default one second. */
export const onInterval = attribute({
  name: 'on-interval',
  key: 'forbidden',
  value: 'required',
  returns: false,
  mount({ mods, evaluate }) {
    const d = mods.get('duration');
    const run = withViewTransition(() => evaluate(), mods);
    if (d?.includes('leading')) run();
    const id = setInterval(run, toMs(d, 1000));
    return () => clearInterval(id);
  },
});

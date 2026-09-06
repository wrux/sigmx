import { attribute } from '../../kernel/index.js';

/** Renders the store (or a filtered part) as JSON. `__terse` for single-line output. */
export const jsonSignals = attribute({
  name: 'json-signals',
  key: 'forbidden',
  mount({ el, value, mods, evaluate, effect, store }) {
    const filter = value ? evaluate() : undefined;
    effect(() => {
      el.textContent = JSON.stringify(store.snapshot(filter), null, mods.has('terse') ? 0 : 2);
    });
  },
});

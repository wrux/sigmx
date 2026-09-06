import { dir } from '../def.js';

/** Renders the store (or a filtered part) as JSON. `__terse` for single-line output. */
export const jsonSignals = dir('json-signals', 2, ({ el, value, evaluate, effect, store }) => {
  const filter = value ? evaluate() : undefined;
  effect(() => {
    el.textContent = JSON.stringify(store.snapshot(filter), null, 2);
  });
});

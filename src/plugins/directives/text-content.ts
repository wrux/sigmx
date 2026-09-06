import { dir } from '../def.js';

export const text = dir('text', 6, ({ el, evaluate, effect }) =>
  effect(() => {
    el.textContent = String(evaluate() ?? '');
  }),
);

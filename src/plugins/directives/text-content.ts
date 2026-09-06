import { attribute } from '../../kernel/index.js';

export const text = attribute({
  name: 'text',
  key: 'forbidden',
  value: 'required',
  mount: ({ el, evaluate, effect }) =>
    effect(() => {
      el.textContent = String(evaluate() ?? '');
    }),
});

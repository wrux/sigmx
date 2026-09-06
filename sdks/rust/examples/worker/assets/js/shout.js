// A custom directive, picked up by auto mode because `data-shout` appears in the templates.
// `data-shout="$name"` renders the expression's value in upper case.
import { attribute } from '../vendor/sigmx/kernel/index.js';

export const shout = attribute({
  name: 'shout',
  value: 'required',
  mount({ el, evaluate, effect }) {
    effect(() => {
      el.textContent = String(evaluate() ?? '').toUpperCase();
    });
  },
});

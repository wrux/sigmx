import { attribute } from 'sigmx';

/** `data-upper="$name"`: our own directive, picked up by auto mode because index.html uses it. */
export const upper = attribute({
  name: 'upper',
  value: 'required',
  mount({ el, evaluate, effect }) {
    effect(() => {
      el.textContent = String(evaluate() ?? '').toUpperCase();
    });
  },
});

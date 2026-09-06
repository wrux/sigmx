import { dir } from '../def.js';

/** Sets `innerHTML` from an expression: `html="$markup"`. Scripts inside are not executed. */
export const html = dir('html', 6, ({ el, evaluate, effect }) =>
  effect(() => {
    el.innerHTML = String(evaluate() ?? '');
  }),
);

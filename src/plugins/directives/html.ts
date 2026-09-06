import { attribute } from '../../kernel/index.js'

/** Sets `innerHTML` from an expression: `html="$markup"`. Scripts inside are not executed. */
export const html = attribute({
  name: 'html',
  key: 'forbidden',
  value: 'required',
  mount: ({ el, evaluate, effect }) =>
    effect(() => {
      el.innerHTML = String(evaluate() ?? '')
    }),
})

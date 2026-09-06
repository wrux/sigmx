import { attribute } from '../../kernel/index.js';

/** The expression's string becomes the field's validity message; '' means valid. */
export const customValidity = attribute({
  name: 'custom-validity',
  key: 'forbidden',
  value: 'required',
  mount({ el, evaluate, effect, error }) {
    if (!('setCustomValidity' in el)) throw error('only works on form fields');
    effect(() => (el as HTMLInputElement).setCustomValidity(String(evaluate() ?? '')));
  },
});

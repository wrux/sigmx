import { dir } from '../def.js';

/** The expression's string becomes the field's validity message; '' means valid. */
export const customValidity = dir('custom-validity', 6, ({ el, evaluate, effect, error }) => {
  if (!('setCustomValidity' in el)) throw error('only works on form fields');
  effect(() => (el as HTMLInputElement).setCustomValidity(String(evaluate() ?? '')));
});

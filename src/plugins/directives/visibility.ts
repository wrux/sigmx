import { dir } from '../def.js';

/** Toggles `display: none`, restoring whatever inline display the element had. */
export const show = dir('show', 6, ({ el, evaluate, effect }) => {
  const initial = el.style.display === 'none' ? '' : el.style.display;
  effect(() => {
    el.style.display = evaluate() ? initial : 'none';
  });
  return () => {
    el.style.display = initial;
  };
});

import { dir } from '../def.js';

export const viewTransition = dir('view-transition', 6, ({ el, evaluate, effect }) =>
  effect(() => el.style.setProperty('view-transition-name', String(evaluate()))),
);

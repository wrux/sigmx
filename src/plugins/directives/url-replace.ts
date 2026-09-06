import { dir } from '../def.js';

export const replaceUrl = dir('replace-url', 6, ({ evaluate, effect }) =>
  effect(() => history.replaceState(history.state, '', new URL(String(evaluate()), location.href))),
);

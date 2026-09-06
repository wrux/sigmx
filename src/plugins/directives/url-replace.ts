import { attribute } from '../../kernel/index.js';

export const replaceUrl = attribute({
  name: 'replace-url',
  key: 'forbidden',
  value: 'required',
  mount: ({ evaluate, effect }) =>
    effect(() => history.replaceState(history.state, '', new URL(String(evaluate()), location.href))),
});

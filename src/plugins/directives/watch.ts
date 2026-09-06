import { attribute } from '../../kernel/index.js';

export const effect = attribute({
  name: 'effect',
  key: 'forbidden',
  value: 'required',
  returns: false,
  mount: (ctx) => ctx.effect(() => ctx.evaluate()),
});

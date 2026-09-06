import { attribute } from '../../kernel/index.js'

/** Runs the expression now and whenever a signal it read changes. */
export const effect = attribute({
  name: 'effect',
  key: 'forbidden',
  value: 'required',
  returns: false,
  mount: (ctx) => ctx.effect(() => ctx.evaluate()),
})

import { action, batch, untracked, type Filter } from '../../kernel/index.js'

/** `@toggleAll({ include: /^flags\./ })` negates every matching boolean signal. */
export const toggleAll = action({
  name: 'toggleAll',
  call: ({ store }, filter?: Filter) =>
    batch(() => untracked(() => { for (const p of store.paths(filter)) store.set(p, !store.get(p)) })),
})

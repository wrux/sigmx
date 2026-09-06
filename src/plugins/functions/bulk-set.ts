import { action, batch, type Filter, untracked } from '../../kernel/index.js';

/** `@setAll(value, { include: /^form\./ })` assigns every matching signal. */
export const setAll = action({
  name: 'setAll',
  call: ({ store }, value: unknown, filter?: Filter) =>
    batch(() =>
      untracked(() => {
        for (const p of store.paths(filter)) store.set(p, value);
      }),
    ),
});

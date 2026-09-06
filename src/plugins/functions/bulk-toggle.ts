import { batch, type Filter, untracked } from '../../kernel/index.js';
import { act } from '../def.js';

/** `@toggleAll({ include: /^flags\./ })` negates every matching boolean signal. */
export const toggleAll = act('toggleAll', ({ store }, filter?: Filter) =>
  batch(() =>
    untracked(() => {
      for (const p of store.paths(filter)) store.set(p, !store.get(p));
    }),
  ),
);

import { batch, type Filter, untracked } from '../../kernel/index.js';
import { act } from '../def.js';

/** `@setAll(value, { include: /^form\./ })` assigns every matching signal. */
export const setAll = act('setAll', ({ store }, value: unknown, filter?: Filter) =>
  batch(() =>
    untracked(() => {
      for (const p of store.paths(filter, { computed: false })) store.set(p, value);
    }),
  ),
);

import { dir } from '../def.js';

/**
 * Saves matching signals to localStorage (`__session` for sessionStorage) and restores them on
 * mount. `persist:key` sets the storage key; the value is an optional `{ include, exclude }` filter.
 * Declare defaults with `signals:x__ifmissing` so restored values are not overwritten.
 */
export const persist = dir('persist', 0, ({ key, value, evaluate, store, effect }) => {
  const name = key || 'sigmx';
  const filter = value ? evaluate() : undefined;
  const saved = localStorage.getItem(name);
  if (saved) store.merge(JSON.parse(saved));
  effect(() => localStorage.setItem(name, JSON.stringify(store.snapshot(filter, { computed: false }))));
});

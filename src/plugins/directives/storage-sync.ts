import { dir } from '../def.js';

/**
 * Saves matching signals to localStorage and restores them on
 * mount. `persist:key` sets the storage key; the value is an optional `{ include, exclude }` filter.
 * Declare defaults with `signals:x__ifmissing` so restored values are not overwritten.
 */
export const persist = dir('persist', 0, ({ key, value, evaluate, store, effect }) => {
  const name = key || 'sigmx';
  const filter = value ? evaluate() : undefined;
  try {
    const saved = localStorage.getItem(name);
    if (saved) store.merge(JSON.parse(saved));
  } catch {} // corrupted or blocked storage: start from the declared defaults
  effect(() => {
    try {
      localStorage.setItem(name, JSON.stringify(store.snapshot(filter, { computed: false })));
    } catch {} // quota exceeded or storage disabled: keep working in memory
  });
});

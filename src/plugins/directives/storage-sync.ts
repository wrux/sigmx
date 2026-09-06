import { attribute } from '../../kernel/index.js';

/**
 * Saves matching signals to localStorage (`__session` for sessionStorage) and restores them on
 * mount. `persist:key` sets the storage key; the value is an optional `{ include, exclude }` filter.
 * Declare defaults with `signals:x__ifmissing` so restored values are not overwritten.
 */
export const persist = attribute({
  name: 'persist',
  mount({ key, value, mods, evaluate, store, effect }) {
    const storage = mods.has('session') ? sessionStorage : localStorage;
    const name = key || 'sigmx';
    const filter = value ? evaluate() : undefined;
    const saved = storage.getItem(name);
    if (saved) store.merge(JSON.parse(saved));
    effect(() => storage.setItem(name, JSON.stringify(store.snapshot(filter, { computed: false }))));
  },
});

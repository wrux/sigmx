import { dir } from '../def.js';

/** Stores the element in a signal: `ref:dialog` or `ref="dialog"`. */
export const ref = dir('ref', 0, ({ el, key, value, cased, store }) => {
  const path = key ? cased() : value.trim();
  store.set(path, el);
  return () => store.remove(path);
});

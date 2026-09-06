import { computed as makeComputed } from '../../kernel/index.js';
import { dir } from '../def.js';

/** `computed:name="expr"` or `computed="{ name: () => expr }"`. */
export const computed = dir('computed', 5, ({ cased, evaluate, store }) => {
  const path = cased();
  store.define(
    path,
    makeComputed(() => evaluate()),
  );
  return () => store.remove(path); // unsubscribes the computed from everything it read
});

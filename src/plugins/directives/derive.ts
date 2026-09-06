import { computed as makeComputed } from '../../kernel/index.js';
import { dir } from '../def.js';

/** `computed:name="expr"` or `computed="{ name: () => expr }"`. */
export const computed = dir('computed', 5, ({ cased, evaluate, store }) => {
  store.define(
    cased(),
    makeComputed(() => evaluate()),
  );
});

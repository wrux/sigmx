import { attribute, computed as makeComputed } from '../../kernel/index.js';

/** `computed:name="expr"` or `computed="{ name: () => expr }"`. */
export const computed = attribute({
  name: 'computed',
  value: 'required',
  mount({ key, cased, evaluate, store, error }) {
    if (key) {
      store.define(
        cased(),
        makeComputed(() => evaluate()),
      );
      return;
    }
    const obj = evaluate();
    for (const k in obj) {
      if (typeof obj[k] !== 'function') throw error(`"${k}" must be a function`);
      store.define(k, makeComputed(obj[k]));
    }
  },
});

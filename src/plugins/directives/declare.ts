import { attribute, expand } from '../../kernel/index.js';

/** `signals:name="expr"` or `signals="{ ... }"`. `__ifmissing` keeps existing values. */
export const signals = attribute({
  name: 'signals',
  value: 'required',
  mount({ key, cased, evaluate, store, mods }) {
    const v = evaluate();
    store.merge(key ? expand({}, cased(), v) : v, { ifMissing: mods.has('ifmissing') });
  },
});

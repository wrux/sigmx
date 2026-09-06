import { expand } from '../../kernel/index.js';
import { dir } from '../def.js';

/** `signals:name="expr"` or `signals="{ ... }"`. `__ifmissing` keeps existing values. */
export const signals = dir('signals', 4, ({ key, cased, evaluate, store, mods }) => {
  const v = evaluate();
  store.merge(key ? expand({}, cased(), v) : v, { ifMissing: mods.has('ifmissing') });
});

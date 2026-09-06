import { dir } from '../def.js';

const put = (el: Element, name: string, v: unknown) => {
  if (v === false || v == null) el.removeAttribute(name);
  else el.setAttribute(name, v === true ? '' : String(v));
};

/** `attr:title="expr"` or `attr="{ title: expr }"`. true → present, false/null → removed. */
export const attr = dir('attr', 4, ({ el, key, cased, evaluate, effect }) => {
  effect(() => {
    if (key) return put(el, cased('kebab'), evaluate());
    const map = evaluate();
    for (const k in map) put(el, k, map[k]);
  });
});

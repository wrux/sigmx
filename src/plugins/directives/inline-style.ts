import { kebab } from '../../kernel/index.js';
import { dir } from '../def.js';

/** `style:color="expr"` or `style="{ color: expr }"`. Falsy values (except 0) restore the original. */
export const style = dir('style', 4, ({ el, key, cased, evaluate, effect }) => {
  const applied = new Set<string>();
  const put = (prop: string, v: unknown) => {
    if (v || v === 0) {
      el.style.setProperty(prop, String(v));
      applied.add(prop);
    } else el.style.removeProperty(prop);
  };
  effect(() => {
    const map: Record<string, unknown> = key ? { [cased('kebab')]: evaluate() } : evaluate();
    for (const prop of applied) if (!(prop in map)) put(prop, '');
    for (const prop in map) put(kebab(prop), map[prop]);
  });
  return () => {
    for (const prop of applied) el.style.removeProperty(prop);
  };
});

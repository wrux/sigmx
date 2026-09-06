import { dir } from '../def.js';

/** `class:active="expr"` or `class="{ active: expr, 'a b': expr }"`. */
export const className = dir('class', 4, ({ el, key, cased, evaluate, effect }) => {
  const applied = new Set<string>(); // classes this directive turned on (and that were not already there)
  effect(() => {
    const map: Record<string, unknown> = key ? { [cased('kebab')]: evaluate() } : evaluate();
    const seen = new Set<string>();
    for (const k in map) {
      for (const name of k.split(/\s+/).filter(Boolean)) {
        seen.add(name);
        if (map[k]) {
          if (!el.classList.contains(name)) applied.add(name);
          el.classList.add(name);
        } else if (applied.delete(name)) el.classList.remove(name);
      }
    }
    for (const name of applied) if (!seen.has(name) && applied.delete(name)) el.classList.remove(name); // key gone from the object
  });
  return () => el.classList.remove(...applied);
});

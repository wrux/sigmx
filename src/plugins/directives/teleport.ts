import { attribute } from '../../kernel/index.js';

/**
 * Moves the element to another place in the document: `teleport="body"` (a selector).
 * `__prepend` inserts at the start. The element and its signals keep working where it lands.
 */
export const teleport = attribute({
  name: 'teleport',
  key: 'forbidden',
  value: 'required',
  mount({ el, value, mods, error }) {
    const target = document.querySelector(value);
    if (!target) throw error(`no element matches "${value}"`);
    if (el.parentElement === target) return;
    const before = mods.has('prepend') ? target.firstChild : null;
    const t = target as Node & { moveBefore?: (n: Node, b: Node | null) => void };
    // `moveBefore` keeps state and avoids an unmount/remount; fall back to a plain move.
    if (t.moveBefore) t.moveBefore(el, before);
    else target.insertBefore(el, before);
  },
});

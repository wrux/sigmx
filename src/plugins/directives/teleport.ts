import { dir } from '../def.js';

/**
 * Moves the element to another place in the document: `teleport="body"` (a selector).
 * `__prepend` inserts at the start. The element and its signals keep working where it lands.
 */
export const teleport = dir('teleport', 6, ({ el, value, error }) => {
  const target = document.querySelector(value);
  if (!target) throw error(`no element matches "${value}"`);
  if (el.parentElement === target) return;
  const t = target as Node & { moveBefore?: (n: Node, b: Node | null) => void };
  // `moveBefore` keeps state and avoids an unmount/remount; fall back to a plain move.
  (t.moveBefore ?? t.insertBefore).call(t, el, null);
});

import { dir } from '../def.js';

/**
 * Moves the element to another place in the document: `teleport="body"` (a selector).
 * The element and its signals keep working where it lands.
 */
export const teleport = dir('teleport', 38, ({ el, evaluate, error }) => {
  const selector = String(evaluate()); // a literal selector, or an expression with `__dynamic`
  const target = document.querySelector(selector);
  if (!target) throw error(`no element matches "${selector}"`);
  if (el.parentElement === target) return;
  const t = target as Node & { moveBefore?: (n: Node, b: Node | null) => void };
  // `moveBefore` keeps state and avoids an unmount/remount; fall back to a plain move.
  (t.moveBefore ?? t.insertBefore).call(t, el, null);
});

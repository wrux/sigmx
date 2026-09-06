import { toMs } from '../../kernel/index.js';
import { dir } from '../def.js';

/** Removes the element after a delay: `remove-me="3s"` (default immediately). Handy for toasts. */
export const removeMe = dir('remove-me', 34, ({ el, evaluate, value, cleanup, error }) => {
  const delay = value ? String(evaluate()) : ''; // a literal delay, or an expression with `__dynamic`
  if (delay && toMs([delay], -1) < 0) throw error(`bad delay "${delay}"`);
  const t = setTimeout(() => el.remove(), toMs([delay], 0));
  cleanup(() => clearTimeout(t));
});

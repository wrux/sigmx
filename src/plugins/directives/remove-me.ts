import { toMs } from '../../kernel/index.js';
import { dir } from '../def.js';

/** Removes the element after a delay: `remove-me="3s"` (default immediately). Handy for toasts. */
export const removeMe = dir('remove-me', 2, ({ el, value, cleanup, error }) => {
  if (value && toMs([value], -1) < 0) throw error(`bad delay "${value}"`);
  const t = setTimeout(() => el.remove(), toMs([value], 0));
  cleanup(() => clearTimeout(t));
});

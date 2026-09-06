import { attribute, toMs } from '../../kernel/index.js';

/** Removes the element after a delay: `remove-me="3s"` (default immediately). Handy for toasts. */
export const removeMe = attribute({
  name: 'remove-me',
  key: 'forbidden',
  mount({ el, value, cleanup }) {
    const t = setTimeout(() => el.remove(), toMs([value], 0));
    cleanup(() => clearTimeout(t));
  },
});

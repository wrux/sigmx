import { attribute } from '../../kernel/index.js';

/**
 * Removed as soon as the element mounts. Pair it with CSS that hides cloaked markup until then:
 * `[data-cloak] { display: none !important }`.
 */
export const cloak = attribute({
  name: 'cloak',
  key: 'forbidden',
  value: 'forbidden',
  mount: ({ el, attr }) => el.removeAttribute(attr),
});

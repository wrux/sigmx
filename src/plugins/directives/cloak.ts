import { dir } from '../def.js';

/**
 * Removed as soon as the element mounts. Pair it with CSS that hides cloaked markup until then:
 * `[data-cloak] { display: none !important }`.
 */
export const cloak = dir('cloak', 10, ({ el, attr }) => el.removeAttribute(attr));

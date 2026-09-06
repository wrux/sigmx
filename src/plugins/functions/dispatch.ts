import { act } from '../def.js';

/** `@dispatch('name', detail)` fires a bubbling CustomEvent from the element. */
export const dispatch = act('dispatch', ({ el }, name: string, detail?: unknown) =>
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true })),
);

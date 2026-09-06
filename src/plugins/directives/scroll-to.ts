import { dir } from '../def.js';

const pick = (mods: Map<string, string[]>, re: RegExp, fallback: string) =>
  [...mods.keys()].find((n) => re.test(n)) ?? fallback;

/**
 * Scrolls the element into view when it mounts: `scroll-into-view__smooth__vcenter__focus`.
 * Modifiers: `smooth|instant|auto`, `vstart|vcenter|vend|vnearest`, `focus`.
 */
export const scrollIntoView = dir('scroll-into-view', 10, ({ el, mods }) => {
  el.scrollIntoView({
    behavior: pick(mods, /^(smooth|instant|auto)$/, 'smooth') as ScrollBehavior,
    block: pick(mods, /^v(start|center|end|nearest)$/, 'vcenter').slice(1) as ScrollLogicalPosition,
  });
  if (mods.has('focus')) (el as HTMLElement).focus?.();
});

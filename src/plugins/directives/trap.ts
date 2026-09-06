import { dir } from '../def.js';

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex],[contenteditable]';

/**
 * Keeps keyboard focus inside the element while the expression is true and restores the previously
 * focused element when it turns false: `trap="$open"`.
 */
export const trap = dir('trap', 6, ({ el, evaluate, effect, listen, cleanup }) => {
  let previous: Element | null = null;
  let active = false;
  const focusables = () =>
    [...el.querySelectorAll<HTMLInputElement>(FOCUSABLE)].filter(
      (e) =>
        !e.disabled &&
        e.type !== 'hidden' &&
        e.getAttribute('tabindex') !== '-1' &&
        (e.offsetParent !== null || e === document.activeElement),
    );
  const release = () => {
    if (!active) return;
    active = false;
    (previous as HTMLElement | null)?.focus?.();
  };
  listen(document, 'keydown', (e: KeyboardEvent) => {
    if (!active || e.key !== 'Tab') return;
    const items = focusables();
    const n = items.length;
    if (!n) return e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLInputElement);
    const d = e.shiftKey ? -1 : 1;
    const next = i < 0 ? (d < 0 ? n - 1 : 0) : (i + d + n) % n;
    if (i < 0 || next !== i + d) {
      e.preventDefault();
      items[next].focus();
    }
  });
  effect(() => {
    if (evaluate()) {
      if (active) return;
      active = true;
      previous = document.activeElement;
      queueMicrotask(() => (focusables()[0] ?? (el as HTMLElement)).focus?.());
    } else release();
  });
  cleanup(release);
});

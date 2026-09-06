import { attribute } from '../../kernel/index.js';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable]';

/**
 * Keeps keyboard focus inside the element while the expression is true and restores the previously
 * focused element when it turns false: `trap="$open"`. `__inert` also makes the rest of the page inert.
 */
export const trap = attribute({
  name: 'trap',
  key: 'forbidden',
  value: 'required',
  mount({ el, mods, evaluate, effect, listen, cleanup }) {
    let previous: Element | null = null;
    let active = false;
    const inerted: Element[] = [];
    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (e) => e.offsetParent !== null || e === document.activeElement,
      );
    const release = () => {
      if (!active) return;
      active = false;
      for (const e of inerted.splice(0)) e.removeAttribute('inert');
      (previous as HTMLElement | null)?.focus?.();
    };
    listen(document, 'keydown', (e: KeyboardEvent) => {
      if (!active || e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
      if (i < 0 || next !== i + (e.shiftKey ? -1 : 1)) {
        e.preventDefault();
        items[next].focus();
      }
    });
    effect(() => {
      if (evaluate()) {
        if (active) return;
        active = true;
        previous = document.activeElement;
        if (mods.has('inert')) {
          for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
            for (const sib of n.parentElement?.children ?? [])
              if (sib !== n && !sib.hasAttribute('inert')) {
                sib.setAttribute('inert', '');
                inerted.push(sib);
              }
          }
        }
        queueMicrotask(() => (focusables()[0] ?? (el as HTMLElement)).focus?.());
      } else release();
    });
    cleanup(release);
  },
});

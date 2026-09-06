import { toMs } from '../../kernel/index.js';
import { dir } from '../def.js';

/** '12.5px' → [12.5, 'px']; undefined when not numeric. */
const num = (s: string): [number, string] | undefined => {
  const m = /^\s*(-?\d*\.?\d+)([a-z%]*)\s*$/i.exec(s);
  return m ? [+m[1], m[2]] : undefined;
};

/**
 * `animate:opacity="$open ? 1 : 0"` tweens a numeric CSS property from its
 * current value to the expression's value whenever the expression changes.
 * `__duration.300ms` sets the length; the tween eases out. Non-numeric values apply immediately.
 */
export const animate = dir('animate', 5, ({ el, mods, cased, evaluate, effect, cleanup }) => {
  const prop = cased('kebab');
  const duration = toMs(mods.get('duration'), 300);
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Prefer the inline value (which this directive wrote last time); computed styles report px only.
  const read = () => el.style.getPropertyValue(prop) || getComputedStyle(el).getPropertyValue(prop);
  const write = (v: string) => el.style.setProperty(prop, v);
  let frame = 0;
  let first = true;
  let last: string | undefined;
  effect(() => {
    const to = String(evaluate());
    if (to === last) return;
    last = to;
    cancelAnimationFrame(frame);
    const from = num(read());
    const target = num(to);
    if (first || instant || !from || !target || from[1] !== target[1]) {
      first = false;
      return write(to);
    }
    const [a, unit] = from;
    const b = target[0];
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      write(`${a + (b - a) * (1 - (1 - p) ** 2)}${unit}`);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  cleanup(() => cancelAnimationFrame(frame));
});

import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

/** Runs when the element enters the viewport. Modifiers: once, exit, full, half, threshold.N. */
export const onIntersect = dir('on-intersect', 22, ({ el, mods, evaluate }) => {
  const t = mods.get('threshold')?.[0];
  const threshold = t ? Math.min(100, Math.max(0, +t)) / 100 : 0;
  const run = withTiming(() => evaluate(), mods);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting === mods.has('exit')) continue;
        run();
        if (mods.has('once')) io.disconnect();
      }
    },
    { threshold },
  );
  io.observe(el);
  return () => io.disconnect();
});

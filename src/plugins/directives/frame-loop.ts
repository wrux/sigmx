import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

export const onRaf = dir('on-raf', 22, ({ mods, evaluate }) => {
  const run = withTiming(() => evaluate(), mods);
  let id = requestAnimationFrame(function tick() {
    run();
    id = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(id);
});

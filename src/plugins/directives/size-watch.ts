import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

export const onResize = dir('on-resize', 22, ({ el, mods, evaluate, cleanup }) => {
  const run = withTiming(() => evaluate(), mods, cleanup);
  const ro = new ResizeObserver(() => run());
  ro.observe(el);
  return () => ro.disconnect();
});

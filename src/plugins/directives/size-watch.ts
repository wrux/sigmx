import { attribute, withTiming } from '../../kernel/index.js';

export const onResize = attribute({
  name: 'on-resize',
  key: 'forbidden',
  value: 'required',
  returns: false,
  mount({ el, mods, evaluate }) {
    const run = withTiming(() => evaluate(), mods);
    const ro = new ResizeObserver(() => run());
    ro.observe(el);
    return () => ro.disconnect();
  },
});

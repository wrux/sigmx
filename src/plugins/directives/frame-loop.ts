import { attribute, withTiming } from '../../kernel/index.js';

export const onRaf = attribute({
  name: 'on-raf',
  key: 'forbidden',
  value: 'required',
  returns: false,
  mount({ mods, evaluate }) {
    const run = withTiming(() => evaluate(), mods);
    let id = requestAnimationFrame(function tick() {
      run();
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  },
});

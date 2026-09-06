import { toMs } from '../../kernel/index.js';
import { dir } from '../def.js';

/** `on-interval__duration.5s.leading="expr"`. Default one second. */
export const onInterval = dir('on-interval', 22, ({ mods, evaluate }) => {
  const d = mods.get('duration');
  const run = () => evaluate();
  const id = setInterval(run, toMs(d, 1000));
  return () => clearInterval(id);
});

import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

/** Runs once when the element is mounted. Supports `__delay.500ms` and `__viewtransition`. */
export const init = dir('init', 22, ({ mods, evaluate }) => {
  withTiming(() => evaluate(), mods)();
});

import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

/** Runs once when the element is mounted. */
export const init = dir('init', 22, ({ mods, evaluate, cleanup }) => {
  withTiming(() => evaluate(), mods, cleanup)();
});

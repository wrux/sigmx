import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

/**
 * `on:click="expr"`. Modifiers: window, document, outside, prevent, stop, capture, passive, once,
 * delay/debounce/throttle, viewtransition, case.
 */
export const on = dir('on', 21, ({ el, mods, cased, evaluate, listen, cleanup }) => {
  const type = cased('kebab');
  const outside = mods.has('outside');
  const target: EventTarget = mods.has('window')
    ? window
    : mods.has('document') || outside || type.startsWith('sigmx-')
      ? document
      : el;
  const run = withTiming((e: Event) => evaluate(e), mods, cleanup);
  listen(
    target,
    type,
    (e: Event) => {
      if (outside && el.contains(e.target as Node)) return;
      if (mods.has('prevent') || (type === 'submit' && el instanceof HTMLFormElement)) e.preventDefault();
      if (mods.has('stop')) e.stopPropagation();
      run(e);
    },
    { once: mods.has('once') },
  );
});

import { dir } from '../def.js';

/**
 * Keeps a boolean signal in step with a media query: `match-media:dark="(prefers-color-scheme: dark)"`.
 * The value is a literal; `__dynamic` makes it an expression that can read signals.
 */
export const matchMedia = dir('match-media', 37, ({ cased, evaluate, store, effect, cleanup }) => {
  const path = cased();
  let mql: MediaQueryList | undefined;
  const sync = () => store.set(path, !!mql?.matches);
  const stop = () => mql?.removeEventListener('change', sync);
  effect(() => {
    let q = String(evaluate()).trim();
    if (/^[\w-]+\s*:/.test(q)) q = `(${q})`; // a bare `feature: value` pair gets its parentheses
    stop();
    mql = window.matchMedia(q);
    sync();
    mql.addEventListener('change', sync);
  });
  cleanup(stop);
});

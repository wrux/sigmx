import { dir } from '../def.js';

/** `match-media:is-dark="'prefers-color-scheme: dark'"` keeps a boolean signal in sync. */
export const matchMedia = dir('match-media', 5, ({ cased, evaluate, store, listen }) => {
  let q = String(evaluate()).trim();
  if (/^[\w-]+\s*:/.test(q)) q = `(${q})`;
  const mql = window.matchMedia(q);
  const path = cased();
  const sync = () => store.set(path, mql.matches);
  sync();
  listen(mql, 'change', sync);
});

import { attribute } from '../../kernel/index.js';

/** `match-media:is-dark="'prefers-color-scheme: dark'"` keeps a boolean signal in sync. */
export const matchMedia = attribute({
  name: 'match-media',
  key: 'required',
  value: 'required',
  mount({ cased, evaluate, store, listen }) {
    let q = String(evaluate()).trim();
    if (!/^[(a-z]/.test(q) || (!q.startsWith('(') && q.includes(':') && !/^(not|only|all|screen|print)\b/.test(q)))
      q = `(${q})`;
    const mql = window.matchMedia(q);
    const path = cased();
    const sync = () => store.set(path, mql.matches);
    sync();
    listen(mql, 'change', sync);
  },
});

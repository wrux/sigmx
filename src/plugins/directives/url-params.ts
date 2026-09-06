import { dir } from '../def.js';

const parse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};
const enc = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const same = (a: unknown, b: unknown) => enc(a) === enc(b);
const params = () => new URLSearchParams(location.search);

/**
 * Keeps signals and the URL query string in step.
 *
 * Keyed form declares one signal with a default: `query-string:page="1"` creates `page`, reads
 * `?page=` on load when present (otherwise uses the default), writes it whenever it changes, and
 * drops the parameter again when the value is back at the default. The parameter name is the key
 * as written; the signal name is recased as usual.
 *
 * Bare form syncs existing signals: `query-string="{ include: /^(q|sort)$/ }"` mirrors matching
 * paths both ways. `__history` pushes an entry per change and restores on back/forward;
 * `__filter` drops empty values from the URL.
 */
export const queryString = dir('query-string', 1, ({ key, value, mods, evaluate, cased, store, listen, effect }) => {
  const history = mods.has('history');
  let restoring = false;
  /** `read` pulls signals from the query; `write` puts them into it. Reads are wired to back/forward. */
  const wire = (read: (q: URLSearchParams) => void, write: (q: URLSearchParams) => void) => {
    effect(() => {
      const q = params();
      write(q);
      if (restoring) return;
      const url = `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`;
      if (url !== location.pathname + location.search + location.hash)
        window.history[history ? 'pushState' : 'replaceState'](null, '', url);
    });
    if (history)
      listen(window, 'popstate', () => {
        restoring = true;
        try {
          read(params());
        } finally {
          restoring = false;
        }
      });
  };

  {
    const name = key as string;
    const path = cased();
    const fallback = value ? evaluate() : '';
    const read = (q: URLSearchParams) => {
      const raw = q.get(name);
      store.set(path, raw === null ? fallback : parse(raw));
    };
    if (!store.has(path) || params().has(name)) read(params());
    wire(read, (q) => {
      const v = store.get(path);
      v === undefined || same(v, fallback) ? q.delete(name) : q.set(name, enc(v));
    });
  }
});

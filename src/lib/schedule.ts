export type Mods = Map<string, string[]>;
type Fn = (...args: any[]) => void;

/** '300ms' → 300, '2s' → 2000, '150' → 150. */
export const toMs = (args: string[] | undefined, fallback = 0): number => {
  for (const a of args ?? []) {
    const m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(a);
    if (m) return +m[1] * (m[2] === 's' ? 1000 : 1);
  }
  return fallback;
};

export const delay =
  (fn: Fn, ms: number): Fn =>
  (...args) =>
    void setTimeout(fn, ms, ...args);

/** Shared rate limiter. `restart` makes it a debounce (the window restarts on every call). */
const limit = (fn: Fn, ms: number, leading: boolean, trailing: boolean, restart: boolean): Fn => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: any[] | undefined;
  const fire = () => {
    timer = undefined;
    if (trailing && last) fn(...last);
    last = undefined;
  };
  return (...args) => {
    if (timer) {
      last = args;
      if (restart) {
        clearTimeout(timer);
        timer = setTimeout(fire, ms);
      }
      return;
    }
    if (leading) fn(...args);
    else last = args;
    timer = setTimeout(fire, ms);
  };
};

/** Debounce: wait for a quiet period. `leading` fires on the first call, `trailing` on the last. */
export const debounce = (fn: Fn, ms: number, leading = false, trailing = true): Fn =>
  limit(fn, ms, leading, trailing, true);

/** Throttle: at most one call per window. `leading` fires immediately, `trailing` fires once at the end. */
export const throttle = (fn: Fn, ms: number, leading = true, trailing = false): Fn =>
  limit(fn, ms, leading, trailing, false);

export const withTiming = (fn: Fn, mods: Mods): Fn => {
  const db = mods.get('debounce');
  if (db) fn = limit(fn, toMs(db, 300), db.includes('leading'), !db.includes('notrailing'), true);
  const th = mods.get('throttle');
  if (th) fn = limit(fn, toMs(th, 300), !th.includes('noleading'), th.includes('trailing'), false);
  return fn;
};

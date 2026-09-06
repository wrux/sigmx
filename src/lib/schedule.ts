export type Mods = Map<string, string[]>;
type Fn = (...args: any[]) => void;

/** '300ms' → 300, '2s' → 2000, '150' → 150; `__x.1.5s` arrives split on the dot and is joined back first. */
export const toMs = (args: string[] | undefined, fallback = 0): number => {
  for (const a of args?.length ? [args.join('.'), ...args] : []) {
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
type Limited = Fn & { cancel(): void };
const limit = (fn: Fn, ms: number, leading: boolean, trailing: boolean, restart: boolean): Limited => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: any[] | undefined;
  const fire = () => {
    timer = undefined;
    if (trailing && last) fn(...last);
    last = undefined;
  };
  const limited: Limited = (...args) => {
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
  limited.cancel = () => {
    clearTimeout(timer);
    timer = last = undefined;
  };
  return limited;
};

/** Debounce: wait for a quiet period. `leading` fires on the first call, `trailing` on the last. */
export const debounce = (fn: Fn, ms: number, leading = false, trailing = true): Fn =>
  limit(fn, ms, leading, trailing, true);

/** Throttle: at most one call per window. `leading` fires immediately, `trailing` fires once at the end. */
export const throttle = (fn: Fn, ms: number, leading = true, trailing = false): Fn =>
  limit(fn, ms, leading, trailing, false);

/** Apply `__debounce` / `__throttle`; `cleanup` cancels a pending trailing call when the attribute unmounts. */
export const withTiming = (fn: Fn, mods: Mods, cleanup?: (f: () => void) => unknown): Fn => {
  const db = mods.get('debounce');
  const th = mods.get('throttle');
  if (db) fn = limit(fn, toMs(db, 300), db.includes('leading'), !db.includes('notrailing'), true);
  if (th) fn = limit(fn, toMs(th, 300), !th.includes('noleading'), th.includes('trailing'), false);
  if (db || th) cleanup?.((fn as Limited).cancel);
  return fn;
};

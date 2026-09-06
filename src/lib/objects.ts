export const isPlain = (v: unknown): v is Record<string, any> => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Keys that would walk into Object.prototype are never written: patches can come from a network. */
export const safeKey = (k: string): boolean => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';

export const expand = (out: Record<string, any>, path: string, value: any): Record<string, any> => {
  const keys = path.split('.');
  if (!keys.every(safeKey)) return out;
  const last = keys.pop() as string;
  let cur = out;
  for (const k of keys) {
    if (!isPlain(cur[k]) || !Object.hasOwn(cur, k)) cur[k] = {};
    cur = cur[k];
  }
  cur[last] = value;
  return out;
};

export type Filter = { include?: RegExp; exclude?: RegExp } | ((path: string) => boolean);

/** Turn `{ include, exclude }` regexes or a predicate into a path predicate. */
export const toPredicate = (f?: Filter): ((path: string) => boolean) => {
  if (typeof f === 'function') return f;
  // Reset lastIndex so a /g or /y regex gives the same answer for every path.
  const test = (re: RegExp | undefined, p: string) => {
    if (!re) return undefined;
    re.lastIndex = 0;
    return re.test(p);
  };
  return (p) => (test(f?.include, p) ?? true) && !test(f?.exclude, p);
};

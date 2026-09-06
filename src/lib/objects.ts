export const isPlain = (v: unknown): v is Record<string, any> => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export const expand = (out: Record<string, any>, path: string, value: any): Record<string, any> => {
  const keys = path.split('.');
  const last = keys.pop() as string;
  let cur = out;
  for (const k of keys) {
    if (!isPlain(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[last] = value;
  return out;
};

export type Filter = { include?: RegExp; exclude?: RegExp } | ((path: string) => boolean);

/** Turn `{ include, exclude }` regexes or a predicate into a path predicate. */
export const toPredicate = (f?: Filter): ((path: string) => boolean) => {
  if (typeof f === 'function') return f;
  return (p) => (f?.include?.test(p) ?? true) && !f?.exclude?.test(p);
};

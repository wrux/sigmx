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

export type Filter = { include?: RegExp | string; exclude?: RegExp | string } | ((path: string) => boolean);

const re = (v: RegExp | string | undefined, fallback: RegExp): RegExp =>
  v === undefined ? fallback : typeof v === 'string' ? new RegExp(v.replace(/^\/|\/$/g, '')) : v;

/** Turn `{ include, exclude }` (regex or string) or a predicate into a path predicate. */
export const toPredicate = (f?: Filter): ((path: string) => boolean) => {
  if (typeof f === 'function') return f;
  const inc = re(f?.include, /(?:)/);
  const exc = re(f?.exclude, /(?!)/);
  return (p) => inc.test(p) && !exc.test(p);
};

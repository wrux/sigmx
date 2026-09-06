// Build-time expression compiler. Not for the browser: import it from a Vite/Astro plugin.
import { rewriteActions, splitStatements } from './compile.js';
import { expressionKey } from './precompiled.js';

const ident = /[A-Za-z0-9_$]/;

/**
 * Rewrite `$name` and `$a.b` into `$.name` / `$.a.b` so the expression runs in strict mode without
 * `with`. Skips strings and comments, recurses into template-literal interpolations, and leaves
 * `$` alone, `$[...]` alone, and `obj.$prop` alone.
 */
export const rewriteSignals = (src: string): string => {
  let out = '';
  let i = 0;
  const n = src.length;
  const prevCode = () => {
    for (let j = out.length - 1; j >= 0; j--) if (!/\s/.test(out[j])) return out[j];
    return '';
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '`') {
      out += c;
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
        } else if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1;
          let j = i + 2;
          while (j < n && depth) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}') depth--;
            if (depth) j++;
          }
          out += `\${${rewriteSignals(src.slice(i + 2, j))}}`;
          i = j + 1;
        } else out += src[i++];
      }
      out += '`';
      i++;
    } else if (c === '/' && next === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
    } else if (c === '/' && next === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
    } else if (
      c === '$' &&
      next !== undefined &&
      ident.test(next) &&
      next !== '$' &&
      (prevCode() !== '.' || /\.\.\.\s*$/.test(out)) && // `obj.$x` is a member, `...$x` a spread
      !ident.test(out[out.length - 1] ?? '')
    ) {
      let j = i + 1;
      while (j < n && ident.test(src[j])) j++;
      out += `$.${src.slice(i + 1, j)}`;
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
};

export const compileBody = (src: string, returns: boolean): string => {
  const code = rewriteSignals(rewriteActions(src.trim()));
  if (!returns) return code;
  const parts = splitStatements(code);
  const last = parts.pop() ?? '';
  return `${parts.length ? `${parts.join(';')};` : ''}return (${last}\n)`;
};

export type Extracted = { src: string; params: string[]; returns: boolean };

export const generateTable = (items: Extracted[]): string => {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { src, params, returns } of items) {
    const key = expressionKey(src, params, returns);
    if (seen.has(key)) continue;
    seen.add(key);
    let body: string;
    try {
      body = compileBody(src, returns);
      Function('$', '__a', ...params, body); // syntax check at build time
    } catch {
      continue; // leave it to the runtime fallback (or fail there)
    }
    lines.push(`  ${JSON.stringify(key)}: function($, __a, ${params.join(', ')}) { ${body} },`);
  }
  return `export const table = {\n${lines.join('\n')}\n}\n`;
};

const entities: Record<string, string> = {
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
};
const decode = (s: string) => s.replace(/&(quot|#39|apos|lt|gt|amp);/g, (m) => entities[m]);

export type PluginMeta = { name: string; returns?: boolean; args?: string[] };

/**
 * Find directive attributes with literal values in template source. Values must be plain quoted
 * strings; anything interpolated at render time is left to the runtime fallback.
 */
export const extractExpressions = (
  source: string,
  plugins: PluginMeta[],
  prefixes: string[] = ['data-'],
): Extracted[] => {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const out: Extracted[] = [];
  const re = /([a-z][\w-]*(?::[^\s="'<>]+)?(?:__[^\s="'<>]+)*)=(?:"([^"]*)"|'([^']*)')/g;
  for (const m of source.matchAll(re)) {
    const attr = m[1];
    const value = decode(m[2] ?? m[3] ?? '');
    const prefix = prefixes.find((p) => attr.startsWith(p));
    if (!prefix || !value.trim()) continue;
    const plugin = byName.get(attr.slice(prefix.length).split('__')[0].split(':')[0]);
    if (!plugin) continue;
    out.push({ src: value, params: ['el', 'evt', ...(plugin.args ?? [])], returns: plugin.returns ?? true });
  }
  return out;
};

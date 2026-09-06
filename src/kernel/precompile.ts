// Build-time expression compiler. Not for the browser: import it from a Vite/Astro plugin.
// It emits the very same strict-mode bodies the runtime compiles, keyed by source text.
import { compileBody, functionCompiler } from './compile.js';
import { expressionKey } from './precompiled.js';

export type Extracted = { src: string; params: string[] };

export const generateTable = (items: Extracted[]): string => {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { src, params } of items) {
    const key = expressionKey(src);
    if (seen.has(key)) continue;
    seen.add(key);
    let body: string;
    try {
      [body] = compileBody(functionCompiler, src, params); // also the syntax check
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
const decode = (s: string) =>
  s.replace(/&(?:quot|apos|lt|gt|amp|#\d+|#x[\da-f]+);/gi, (m) =>
    m[1] === '#'
      ? String.fromCodePoint(
          Number.parseInt(
            m[2] === 'x' || m[2] === 'X' ? m.slice(3, -1) : m.slice(2, -1),
            m[2] === 'x' || m[2] === 'X' ? 16 : 10,
          ),
        )
      : (entities[m.toLowerCase()] ?? m),
  );

export type PluginMeta = { name: string; args?: string[]; literal?: boolean };

/**
 * Find directive attributes with literal values in template source. Values must be plain quoted
 * strings; anything interpolated at render time is left to the runtime fallback. Plugins whose value
 * is a literal (mask, teleport, …) are skipped unless the attribute carries `__dynamic`.
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
    const [head, ...mods] = attr.slice(prefix.length).split('__');
    const plugin = byName.get(head.split(':')[0]);
    if (!plugin || (plugin.literal && !mods.some((x) => x.split('.')[0] === 'dynamic'))) continue;
    out.push({ src: value, params: ['el', 'evt', ...(plugin.args ?? [])] });
  }
  return out;
};

/**
 * Keyed directive attributes whose key contains an uppercase letter. HTML lowercases attribute names,
 * so `data-bind:firstName` reaches the runtime as `firstname`: write `data-bind:first-name`.
 */
export const lintSource = (source: string, prefixes: string[] = ['data-']): string[] => {
  const out: string[] = [];
  for (const p of prefixes)
    for (const m of source.matchAll(new RegExp(`(?<![\\w-\`])(${p}[a-z-]+:[^\\s="'<>\`]*[A-Z][^\\s="'<>\`]*)`, 'g')))
      out.push(`${m[1]}: attribute names are lowercased by HTML; write the key in kebab-case`);
  return out;
};

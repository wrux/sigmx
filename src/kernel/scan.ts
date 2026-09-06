// Node only; never bundled for the browser.
import * as builtins from '../plugins/index.js';
import type { Plugin } from './contracts.js';

export type PluginMeta = {
  export: string;
  name: string;
  type: Plugin['type'];
  from: string;
  literal?: boolean;
  args?: string[];
};

const NETWORK = ['httpGet', 'httpPost', 'httpPut', 'httpPatch', 'httpDelete', 'websocket', 'boost'];

export const implied: Record<string, string[]> = {
  ...Object.fromEntries(NETWORK.map((n) => [n, ['applyElements', 'applyState']])),
  boost: ['httpGet', 'httpPost', 'applyElements', 'applyState'],
};

export const builtinPlugins = (): PluginMeta[] =>
  Object.entries(builtins)
    .filter(([, v]) => v && typeof v === 'object' && 'type' in (v as object))
    .map(([key, v]) => {
      const p = v as Plugin;
      return {
        export: key,
        name: p.name,
        type: p.type,
        from: 'sigmx/plugins',
        literal: (p as any).literal,
        args: (p as any).args,
      };
    });

/**
 * Read a custom plugin's metadata from its source without executing it: finds
 * `attribute({ name: 'x', ... })`, `action({...})` or `handler({...})` near `export const <exportName>`.
 */
export const customPluginMeta = (exportName: string, source: string, from: string): PluginMeta | undefined => {
  const re = new RegExp(
    `export\\s+const\\s+${exportName}\\s*(?::[^=]+)?=\\s*(attribute|action|handler)\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`,
    'm',
  );
  const m = re.exec(source);
  if (!m) return;
  const body = m[2];
  const name = /\bname\s*:\s*['"`]([^'"`]+)['"`]/.exec(body)?.[1];
  if (!name) return;
  const literal = /\bliteral\s*:\s*true/.test(body);
  const args = /\bargs\s*:\s*\[([^\]]*)\]/.exec(body)?.[1];
  return {
    export: exportName,
    name,
    type: m[1] as Plugin['type'],
    from,
    literal: literal || undefined,
    args: args
      ?.split(',')
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean),
  };
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True if `source` refers to the plugin: `data-<name>` for directives, `@name(` for functions, the name as a string for handlers. */
export const mentions = (source: string, p: PluginMeta, prefixes: string[]): boolean => {
  const n = esc(p.name);
  if (p.type === 'attribute')
    return prefixes.some((pre) => new RegExp(`(^|[\\s"'\`<])${esc(pre)}${n}(?=[\\s=:_>"'\`/]|$)`, 'm').test(source));
  if (p.type === 'action') return new RegExp(`@${n}\\s*\\(`).test(source);
  return new RegExp(`['"\`](?:[\\w-]+-)?${n}['"\`]`).test(source);
};

export type Selection = {
  plugins: PluginMeta[];
  reasons: Record<string, string>;
  unused: string[];
};

/**
 * Decide which plugins to ship. `sources` are file contents; `custom` are extra plugins (from
 * `customPluginMeta`); `always` are export names that ship regardless.
 */
export const selectPlugins = (
  sources: string[],
  {
    prefixes = ['data-'],
    always = [],
    custom = [],
  }: { prefixes?: string[]; always?: string[]; custom?: PluginMeta[] } = {},
): Selection => {
  const known = [...builtinPlugins(), ...custom];
  const byExport = new Map(known.map((p) => [p.export, p]));
  const reasons: Record<string, string> = {};
  const add = (exp: string, why: string) => {
    if (!byExport.has(exp) || reasons[exp]) return;
    reasons[exp] = why;
    for (const dep of implied[exp] ?? []) add(dep, exp);
  };
  for (const exp of always) add(exp, 'always');
  const text = sources.join('\n');
  for (const p of known)
    if (!reasons[p.export] && (p.type !== 'handler' || custom.includes(p)) && mentions(text, p, prefixes))
      add(p.export, 'used');
  const plugins = known.filter((p) => reasons[p.export]);
  return { plugins, reasons, unused: known.filter((p) => !reasons[p.export]).map((p) => p.export) };
};

export const generatePluginsModule = (sel: Selection): string => {
  const groups = new Map<string, string[]>();
  for (const p of sel.plugins) groups.set(p.from, [...(groups.get(p.from) ?? []), p.export]);
  const imports = [...groups]
    .map(([from, names]) => `import { ${names.join(', ')} } from ${JSON.stringify(from)}`)
    .join('\n');
  return `${imports}\nexport const plugins = [${sel.plugins.map((p) => p.export).join(', ')}]\nexport const report = ${JSON.stringify({ reasons: sel.reasons, unused: sel.unused }, null, 2)}\n`;
};

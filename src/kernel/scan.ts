// Auto mode: work out which plugins a codebase uses by scanning its source, the way a CSS
// framework scans templates for class names. Node only; never bundled for the browser.
import * as builtins from '../plugins/index.js'
import type { Plugin } from './contracts.js'

export type PluginMeta = {
  /** Export name, e.g. `httpGet`; what the generated module imports. */
  export: string
  /** Registered name, e.g. `get`; what markup refers to. */
  name: string
  type: Plugin['type']
  /** Module to import from; built-ins come from `sigmx/plugins`. */
  from: string
  returns?: boolean
  args?: string[]
}

const NETWORK = ['httpGet', 'httpPost', 'httpPut', 'httpPatch', 'httpDelete', 'websocket', 'boost']

/** Plugins that only make sense together. */
export const implied: Record<string, string[]> = {
  ...Object.fromEntries(NETWORK.map((n) => [n, ['applyElements', 'applyState']])),
  boost: ['httpGet', 'httpPost', 'applyElements', 'applyState'],
}

/** Metadata for every built-in plugin. */
export const builtinPlugins = (): PluginMeta[] =>
  Object.entries(builtins)
    .filter(([, v]) => v && typeof v === 'object' && 'type' in (v as object))
    .map(([key, v]) => {
      const p = v as Plugin
      return { export: key, name: p.name, type: p.type, from: 'sigmx/plugins', returns: (p as any).returns, args: (p as any).args }
    })

/**
 * Read a custom plugin's metadata from its source without executing it: finds
 * `attribute({ name: 'x', ... })`, `action({...})` or `handler({...})` near `export const <exportName>`.
 */
export const customPluginMeta = (exportName: string, source: string, from: string): PluginMeta | undefined => {
  const re = new RegExp(`export\\s+const\\s+${exportName}\\s*(?::[^=]+)?=\\s*(attribute|action|handler)\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`, 'm')
  const m = re.exec(source)
  if (!m) return
  const body = m[2]
  const name = /\bname\s*:\s*['"`]([^'"`]+)['"`]/.exec(body)?.[1]
  if (!name) return
  const returns = /\breturns\s*:\s*(true|false)/.exec(body)?.[1]
  const args = /\bargs\s*:\s*\[([^\]]*)\]/.exec(body)?.[1]
  return {
    export: exportName,
    name,
    type: m[1] as Plugin['type'],
    from,
    returns: returns === undefined ? undefined : returns === 'true',
    args: args?.split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, '')).filter(Boolean),
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True if `source` refers to the plugin: `data-<name>` for directives, `@name(` for functions, the name as a string for handlers. */
export const mentions = (source: string, p: PluginMeta, prefixes: string[]): boolean => {
  const n = escape(p.name)
  if (p.type === 'attribute') return prefixes.some((pre) => new RegExp(`(^|[\\s"'\`<])${escape(pre)}${n}(?=[\\s=:_>"'\`/]|$)`, 'm').test(source))
  if (p.type === 'action') return new RegExp(`@${n}\\s*\\(`).test(source)
  return new RegExp(`['"\`](?:[\\w-]+-)?${n}['"\`]`).test(source)
}

export type Selection = {
  /** Selected plugins in a stable order. */
  plugins: PluginMeta[]
  /** Why each one is in: 'used', 'always', or the plugin that implied it. */
  reasons: Record<string, string>
  /** Known plugins that were left out. */
  unused: string[]
}

/**
 * Decide which plugins to ship. `sources` are file contents; `custom` are extra plugins (from
 * `customPluginMeta`); `always` are export names that ship regardless.
 */
export const selectPlugins = (
  sources: string[],
  { prefixes = ['data-'], always = [], custom = [] }: { prefixes?: string[]; always?: string[]; custom?: PluginMeta[] } = {},
): Selection => {
  const known = [...builtinPlugins(), ...custom]
  const byExport = new Map(known.map((p) => [p.export, p]))
  const reasons: Record<string, string> = {}
  const add = (exp: string, why: string) => {
    if (!byExport.has(exp) || reasons[exp]) return
    reasons[exp] = why
    for (const dep of implied[exp] ?? []) add(dep, exp)
  }
  for (const exp of always) add(exp, 'always')
  const text = sources.join('\n')
  for (const p of known) if (!reasons[p.export] && (p.type !== 'handler' || custom.includes(p)) && mentions(text, p, prefixes)) add(p.export, 'used')
  const plugins = known.filter((p) => reasons[p.export])
  return { plugins, reasons, unused: known.filter((p) => !reasons[p.export]).map((p) => p.export) }
}

/** JavaScript source for a module exporting `plugins` (and the selection report). */
export const generatePluginsModule = (sel: Selection): string => {
  const groups = new Map<string, string[]>()
  for (const p of sel.plugins) groups.set(p.from, [...(groups.get(p.from) ?? []), p.export])
  const imports = [...groups].map(([from, names]) => `import { ${names.join(', ')} } from ${JSON.stringify(from)}`).join('\n')
  return `${imports}\nexport const plugins = [${sel.plugins.map((p) => p.export).join(', ')}]\nexport const report = ${JSON.stringify({ reasons: sel.reasons, unused: sel.unused }, null, 2)}\n`
}

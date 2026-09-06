import type { AstroIntegration } from 'astro'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface PrecompileOptions {
  /** Directories to scan for templates, relative to the project root. Default `['src']`. */
  include?: string[]
  /** File extensions to scan. */
  extensions?: string[]
  /**
   * Keep the runtime compiler as a fallback for expressions the scan cannot see (markup built from
   * strings at render time). Default true. Set false to drop the compiler from the bundle entirely;
   * unseen expressions then throw.
   */
  fallback?: boolean
}

export interface SigmxIntegrationOptions {
  /**
   * Inject the client on every page (default true). Set false and import `sigmx-astro/client`
   * from a `<script>` on the pages that need it.
   */
  inject?: boolean
  /**
   * Module specifier of an app-local entrypoint that creates the instance itself, e.g.
   * `/src/sigmx.ts`. When set, the other client options are ignored.
   */
  entrypoint?: string
  /** `'all'` (default), `'minimal'`, or a list of plugin export names from `sigmx/plugins`. */
  plugins?: 'all' | 'minimal' | string[]
  /** Attribute prefix(es) to scan. Default `data-`. */
  prefix?: string | string[]
  /** Server event-name prefixes to accept. Default `sigmx-`. */
  eventPrefix?: string | string[]
  /** Name of the global the instance is exposed as (default `sigmx`); false for none. */
  expose?: string | false
  /**
   * Compile attribute expressions at build time into a function table, so the browser never calls
   * `new Function`. `true` for defaults, or an options object.
   */
  precompile?: boolean | PrecompileOptions
}

const VIRTUAL = 'virtual:sigmx-expressions'
const RESOLVED = '\0' + VIRTUAL

/** Source of the injected client module. Exported for tests and custom entrypoints. */
export const bootScript = (o: SigmxIntegrationOptions = {}): string => {
  const options = JSON.stringify({ prefix: o.prefix, eventPrefix: o.eventPrefix })
  const imports = Array.isArray(o.plugins)
    ? `import { ${o.plugins.join(', ')} } from 'sigmx/plugins';\nconst plugins = [${o.plugins.join(', ')}];`
    : `import { ${o.plugins ?? 'all'} as plugins } from 'sigmx/presets/${o.plugins ?? 'all'}';`
  const expose = o.expose === false ? '' : `\nwindow[${JSON.stringify(o.expose ?? 'sigmx')}] = app;`
  if (!o.precompile) return `import { createSigmx } from 'sigmx';\n${imports}\nconst app = createSigmx({ plugins, ...${options} });${expose}\n`
  const fallback = typeof o.precompile === 'object' && o.precompile.fallback === false ? 'undefined' : 'runtimeExpressions(functionCompiler)'
  return (
    `import { createRuntime, precompiled, runtimeExpressions, functionCompiler } from 'sigmx';\nimport { table } from '${VIRTUAL}';\n${imports}\n` +
    `const app = createRuntime({ plugins, expressions: precompiled(table, ${fallback}), ...${options} });${expose}\n`
  )
}

const walk = (dir: string, exts: string[], out: string[] = []): string[] => {
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    if (e === 'node_modules' || e.startsWith('.')) continue
    if (statSync(p).isDirectory()) walk(p, exts, out)
    else if (exts.some((x) => p.endsWith(x))) out.push(p)
  }
  return out
}

/** Vite plugin that scans templates and serves the expression table as a virtual module. */
export const precompilePlugin = (o: SigmxIntegrationOptions, root: string) => {
  const po: PrecompileOptions = typeof o.precompile === 'object' ? o.precompile : {}
  const dirs = (po.include ?? ['src']).map((d) => join(root, d))
  const exts = po.extensions ?? ['.astro', '.html', '.mdx', '.md', '.ts', '.tsx', '.js', '.jsx', '.svelte', '.vue']
  const prefixes = ([] as string[]).concat(o.prefix ?? 'data-')
  return {
    name: 'sigmx-precompile',
    resolveId: (id: string) => (id === VIRTUAL ? RESOLVED : undefined),
    async load(this: any, id: string) {
      if (id !== RESOLVED) return
      const [{ extractExpressions, generateTable }, presets] = await Promise.all([import('sigmx/precompile'), import('sigmx/presets/all')])
      const meta = presets.all.filter((p: any) => p.type === 'attribute').map((p: any) => ({ name: p.name, returns: p.returns, args: p.args }))
      const items: any[] = []
      for (const dir of dirs) {
        for (const file of walk(dir, exts)) {
          this.addWatchFile?.(file)
          items.push(...extractExpressions(readFileSync(file, 'utf8'), meta, prefixes))
        }
      }
      return generateTable(items)
    },
  }
}

export default function sigmx(options: SigmxIntegrationOptions = {}): AstroIntegration {
  return {
    name: 'sigmx-astro',
    hooks: {
      'astro:config:setup': ({ injectScript, updateConfig, config }) => {
        if (options.precompile) {
          updateConfig({ vite: { plugins: [precompilePlugin(options, new URL(config.root).pathname)] } })
        }
        if (options.inject === false) return
        injectScript('page', options.entrypoint ? `import ${JSON.stringify(options.entrypoint)};` : bootScript(options))
      },
    },
  }
}

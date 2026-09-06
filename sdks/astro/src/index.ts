import type { AstroIntegration } from 'astro'

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
}

/** Source of the injected client module. Exported for tests and custom entrypoints. */
export const bootScript = (o: SigmxIntegrationOptions = {}): string => {
  const options = JSON.stringify({ prefix: o.prefix, eventPrefix: o.eventPrefix })
  const imports = Array.isArray(o.plugins)
    ? `import { ${o.plugins.join(', ')} } from 'sigmx/plugins';\nconst plugins = [${o.plugins.join(', ')}];`
    : `import { ${o.plugins ?? 'all'} as plugins } from 'sigmx/presets/${o.plugins ?? 'all'}';`
  const expose = o.expose === false ? '' : `\nwindow[${JSON.stringify(o.expose ?? 'sigmx')}] = app;`
  return `import { createSigmx } from 'sigmx';\n${imports}\nconst app = createSigmx({ plugins, ...${options} });${expose}\n`
}

export default function sigmx(options: SigmxIntegrationOptions = {}): AstroIntegration {
  return {
    name: 'sigmx-astro',
    hooks: {
      'astro:config:setup': ({ injectScript }) => {
        if (options.inject === false) return
        injectScript('page', options.entrypoint ? `import ${JSON.stringify(options.entrypoint)};` : bootScript(options))
      },
    },
  }
}

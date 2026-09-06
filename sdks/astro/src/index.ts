import type { AstroIntegration } from 'astro';
import {
  type AutoOptions,
  type PrecompileOptions as CorePrecompileOptions,
  sigmxAuto,
  sigmxPrecompile,
} from 'sigmx/vite';

export interface PrecompileOptions extends Omit<CorePrecompileOptions, 'root' | 'prefixes'> {
  /**
   * Keep the runtime compiler as a fallback for expressions the scan cannot see (markup built from
   * strings at render time). Default true. Set false to drop the compiler from the bundle entirely;
   * unseen expressions then throw.
   */
  fallback?: boolean;
}

export interface SigmxIntegrationOptions {
  /**
   * Inject the client on every page (default true). Set false and import `@sigmx/astro/client`
   * from a `<script>` on the pages that need it.
   */
  inject?: boolean;
  /**
   * Module specifier of an app-local entrypoint that creates the instance itself, e.g.
   * `/src/sigmx.ts`. When set, the other client options are ignored.
   */
  entrypoint?: string;
  /**
   * `'all'` (default), `'minimal'`, `'auto'` (scan `src/` and register only what is used), or a
   * list of plugin export names from `sigmx/plugins`.
   */
  plugins?: 'all' | 'minimal' | 'auto' | string[];
  /** Options for `plugins: 'auto'`: `always`, `custom`, `include`, `extensions`, `log`. */
  auto?: Omit<AutoOptions, 'root' | 'prefixes'>;
  /** Attribute prefix(es) to scan. Default `data-`. */
  prefix?: string | string[];
  /** Server event-name prefixes to accept. Default `sigmx-`. */
  eventPrefix?: string | string[];
  /** Name of the global the instance is exposed as (default `sigmx`); false for none. */
  expose?: string | false;
  /**
   * Compile attribute expressions at build time into a function table, so the browser never calls
   * `new Function`. `true` for defaults, or an options object.
   */
  precompile?: boolean | PrecompileOptions;
}

const AUTO = 'virtual:sigmx-plugins';
const EXPRESSIONS = 'virtual:sigmx-expressions';

/** Source of the injected client module. Exported for tests and custom entrypoints. */
export const bootScript = (o: SigmxIntegrationOptions = {}): string => {
  const options = JSON.stringify({ prefix: o.prefix, eventPrefix: o.eventPrefix });
  const imports = Array.isArray(o.plugins)
    ? `import { ${o.plugins.join(', ')} } from 'sigmx/plugins';\nconst plugins = [${o.plugins.join(', ')}];`
    : o.plugins === 'auto'
      ? `import { plugins } from '${AUTO}';`
      : `import { ${o.plugins ?? 'all'} as plugins } from 'sigmx/presets/${o.plugins ?? 'all'}';`;
  const expose = o.expose === false ? '' : `\nwindow[${JSON.stringify(o.expose ?? 'sigmx')}] = app;`;
  if (!o.precompile)
    return `import { createSigmx } from 'sigmx';\n${imports}\nconst app = createSigmx({ plugins, ...${options} });${expose}\n`;
  const fallback =
    typeof o.precompile === 'object' && o.precompile.fallback === false
      ? 'undefined'
      : 'runtimeExpressions(functionCompiler)';
  return (
    `import { createRuntime, precompiled, runtimeExpressions, functionCompiler } from 'sigmx';\nimport { table } from '${EXPRESSIONS}';\n${imports}\n` +
    `const app = createRuntime({ plugins, expressions: precompiled(table, ${fallback}), ...${options} });${expose}\n`
  );
};

export default function sigmx(options: SigmxIntegrationOptions = {}): AstroIntegration {
  return {
    name: '@sigmx/astro',
    hooks: {
      'astro:config:setup': ({ injectScript, updateConfig, config }) => {
        const root = new URL(config.root).pathname;
        const prefixes = ([] as string[]).concat(options.prefix ?? 'data-');
        const plugins: any[] = [];
        if (options.plugins === 'auto') plugins.push(sigmxAuto({ ...options.auto, root, prefixes }));
        if (options.precompile) {
          const po = typeof options.precompile === 'object' ? options.precompile : {};
          plugins.push(
            sigmxPrecompile({
              include: po.include,
              extensions: po.extensions,
              custom: po.custom ?? options.auto?.custom,
              root,
              prefixes,
            }),
          );
        }
        if (plugins.length) updateConfig({ vite: { plugins } });
        if (options.inject === false) return;
        injectScript(
          'page',
          options.entrypoint ? `import ${JSON.stringify(options.entrypoint)};` : bootScript(options),
        );
      },
    },
  };
}

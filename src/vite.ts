import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { extractExpressions, generateTable, lintSource } from './kernel/precompile.js';
import {
  builtinPlugins,
  customPluginMeta,
  generatePluginsModule,
  type PluginMeta,
  type Selection,
  selectPlugins,
} from './kernel/scan.js';

export type ScanOptions = {
  /** Project root; defaults to the current working directory. */
  root?: string;
  /** Directories to scan, relative to root. Default `['src']`. */
  include?: string[];
  extensions?: string[];
  /** Attribute prefixes in use. Default `['data-']`. */
  prefixes?: string[];
};
export type AutoOptions = ScanOptions & {
  /** Export names that ship no matter what, e.g. `['signals', 'httpGet']`. */
  always?: string[];
  /** Custom plugins: export name → module path (absolute or root-relative), e.g. `{ upper: 'src/plugins/upper.ts' }`. */
  custom?: Record<string, string>;
  /** Print the selection at build time. Default true. */
  log?: boolean;
};
export type PrecompileOptions = ScanOptions & {
  /** Custom plugins whose expressions should be precompiled too. */
  custom?: Record<string, string>;
};

export const DEFAULT_EXTENSIONS = [
  '.astro',
  '.html',
  '.mdx',
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.svelte',
  '.vue',
  '.php',
  '.erb',
  '.twig',
  '.hbs',
];

export const walk = (dir: string, exts: string[], out: string[] = []): string[] => {
  // `include` entries may be files (index.html) as well as directories.
  const self = statSync(dir, { throwIfNoEntry: false });
  if (self?.isFile()) {
    if (exts.some((x) => dir.endsWith(x))) out.push(dir);
    return out;
  }
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (e.isFile() && exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
};

const files = (o: ScanOptions) => {
  const root = o.root ?? process.cwd();
  const exts = o.extensions ?? DEFAULT_EXTENSIONS;
  const found = (o.include ?? ['src', 'index.html']).flatMap((d) => walk(join(root, d), exts));
  if (!found.length) console.warn('[sigmx] no source files found to scan; check the `include` option');
  return found;
};

const customMeta = (root: string, custom: Record<string, string> = {}): PluginMeta[] =>
  Object.entries(custom).flatMap(([exp, path]) => {
    const abs = isAbsolute(path) ? path : join(root, path);
    const meta = customPluginMeta(exp, readFileSync(abs, 'utf8'), `/${relative(root, abs).replace(/\\/g, '/')}`);
    if (!meta)
      console.warn(
        `[sigmx] could not read plugin metadata for "${exp}" in ${path}; include it via "always" if it must ship`,
      );
    return meta ? [meta] : [];
  });

/** Scan once and pick plugins: what the Vite plugin and the CLI both do. */
export const scanProject = (o: AutoOptions = {}): Selection & { files: string[] } => {
  const root = o.root ?? process.cwd();
  const list = files(o);
  const sources = list.map((f) => readFileSync(f, 'utf8'));
  list.forEach((f, i) => {
    for (const w of lintSource(sources[i], o.prefixes)) console.warn(`[sigmx] ${relative(root, f)}: ${w}`);
  });
  const sel = selectPlugins(sources, { prefixes: o.prefixes, always: o.always, custom: customMeta(root, o.custom) });
  return { ...sel, files: list };
};

export const AUTO_ID = 'virtual:sigmx-plugins';
export const EXPRESSIONS_ID = 'virtual:sigmx-expressions';

/** Serves `virtual:sigmx-plugins`, exporting the `plugins` array your source actually uses. */
export const sigmxAuto = (o: AutoOptions = {}) => ({
  name: 'sigmx-auto',
  resolveId: (id: string) => (id === AUTO_ID ? `\0${AUTO_ID}` : undefined),
  load(this: any, id: string) {
    if (id !== `\0${AUTO_ID}`) return;
    const sel = scanProject(o);
    for (const f of sel.files) this.addWatchFile?.(f);
    if (o.log ?? true) {
      const names = sel.plugins.map((p) => p.export);
      console.info(`[sigmx] auto: ${names.length} plugins (${names.join(', ')}); ${sel.unused.length} unused`);
    }
    return generatePluginsModule(sel);
  },
});

/** Serves `virtual:sigmx-expressions`, a table of every attribute expression compiled at build time. */
export const sigmxPrecompile = (o: PrecompileOptions = {}) => ({
  name: 'sigmx-precompile',
  resolveId: (id: string) => (id === EXPRESSIONS_ID ? `\0${EXPRESSIONS_ID}` : undefined),
  load(this: any, id: string) {
    if (id !== `\0${EXPRESSIONS_ID}`) return;
    const root = o.root ?? process.cwd();
    const meta = [...builtinPlugins(), ...customMeta(root, o.custom)].filter((p) => p.type === 'attribute');
    const items = [];
    for (const f of files(o)) {
      this.addWatchFile?.(f);
      items.push(...extractExpressions(readFileSync(f, 'utf8'), meta, o.prefixes ?? ['data-']));
    }
    return generateTable(items);
  },
});

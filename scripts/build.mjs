import { execSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

// Node 20 has no fs.globSync; a small recursive walk keeps the build runnable on every supported version.
const tsFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );

// Start clean so renamed or removed modules never linger in the published package.
rmSync('dist', { recursive: true, force: true });

await esbuild.build({
  entryPoints: tsFiles('src'),
  outdir: 'dist',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  mangleProps: /^_/,
});
execSync('npx tsc', { stdio: 'inherit' });
// Convenience script-tag bundle: esbuild bundles and minifies, then terser squeezes a further ~5% gzipped.
// Only safe options: property reads have tracking side effects, so no `pure_getters`.
const bundled = await esbuild.build({
  entryPoints: ['src/standalone.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  mangleProps: /^_/,
  write: false,
});
const { minify } = await import('terser');
const squeezed = await minify(bundled.outputFiles[0].text, {
  module: true,
  compress: { passes: 2 },
  mangle: true,
});
const { writeFileSync } = await import('node:fs');
writeFileSync('dist/sigmx.standalone.js', squeezed.code);
console.log('built dist/');

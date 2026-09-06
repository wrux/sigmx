import * as esbuild from 'esbuild'
import { execSync } from 'node:child_process'
import { globSync } from 'node:fs'

// Library output: one ESM file per source module (consumers' bundlers tree-shake), plus .d.ts via tsc.
await esbuild.build({
  entryPoints: globSync('src/**/*.ts'),
  outdir: 'dist',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  mangleProps: /^_/,
})
execSync('npx tsc', { stdio: 'inherit' })
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
})
const { minify } = await import('terser')
const squeezed = await minify(bundled.outputFiles[0].text, { module: true, compress: { passes: 2 }, mangle: true })
const { writeFileSync } = await import('node:fs')
writeFileSync('dist/sigmx.standalone.js', squeezed.code)
console.log('built dist/')

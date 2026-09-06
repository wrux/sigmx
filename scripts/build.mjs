import * as esbuild from 'esbuild'
import { execSync } from 'node:child_process'
import { globSync } from 'node:fs'

// Library output: one ESM file per source module (consumers' bundlers tree-shake), plus .d.ts via tsc.
await esbuild.build({
  entryPoints: globSync('src/**/*.ts'),
  outdir: 'dist',
  format: 'esm',
  target: 'es2021',
  sourcemap: true,
  mangleProps: /^_/,
})
execSync('npx tsc', { stdio: 'inherit' })
// Convenience script-tag bundle.
await esbuild.build({
  entryPoints: ['src/standalone.ts'],
  outfile: 'dist/sigmx.standalone.js',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2021',
  mangleProps: /^_/,
})
console.log('built dist/')

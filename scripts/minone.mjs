import * as esbuild from 'esbuild'
import { gzipSync } from 'node:zlib'
for (const f of process.argv.slice(2)) {
  const r = await esbuild.build({ entryPoints: [f], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, mangleProps: /^_/, external: ['../../kernel/*', '../../lib/*', './morph.js'], logLevel: 'silent' })
  const out = r.outputFiles[0].text
  console.log(`\n===== ${f}: ${out.length} B min, ${gzipSync(out).length} B gzip\n`)
  console.log(out.replace(/(.{150})/g, '$1\n'))
}

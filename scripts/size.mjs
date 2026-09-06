import * as esbuild from 'esbuild'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const build = async (contents) => {
  const r = await esbuild.build({
    stdin: { contents, resolveDir: 'src', loader: 'ts' },
    bundle: true, minify: true, format: 'esm', target: 'es2021', write: false, mangleProps: /^_/, logLevel: 'silent',
  })
  const out = r.outputFiles[0].contents
  return { raw: out.length, gzip: gzipSync(out, { level: 9 }).length, brotli: brotliCompressSync(out, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length }
}
const withPlugins = (names, extra = '') => `import { createSigmx } from './kernel'; import { ${names.join(', ')} } from './plugins'; ${extra} createSigmx({ plugins: [${names.join(', ')}] })`
const cases = {
  'core only': `import { createSigmx } from './kernel'; createSigmx()`,
  'core + text': withPlugins(['text']),
  'minimal preset (signals, text, show, on)': `import { createSigmx } from './kernel'; import { minimal } from './presets/minimal'; createSigmx({ plugins: minimal })`,
  'minimal + CSP compiler': `import { createSigmx } from './kernel'; import { cspCompiler } from './kernel/strict-csp'; import { minimal } from './presets/minimal'; createSigmx({ plugins: minimal, compile: cspCompiler('x') })`,
  'minimal + fetch + server handlers (morph)': withPlugins(['signals', 'text', 'show', 'on', 'httpGet', 'httpPost', 'applyElements', 'applyState', 'indicator']),
  'everything (standalone build)': `import { sigmx } from './standalone'; console.log(sigmx)`,
}
const plugins = ['signals','computed','effect','ref','text','show','className','style','attr','bind','init','on','onInterval','onIntersect','onSignalPatch','jsonSignals','indicator','onResize','onRaf','matchMedia','scrollIntoView','customValidity','persist','queryString','replaceUrl','viewTransition','animate','peek','setAll','toggleAll','fit','clipboard','intl','httpGet','httpPost','httpPut','httpPatch','httpDelete','applyElements','applyState']
const attrNames = { className: 'class', jsonSignals: 'json-signals', onInterval: 'on-interval', onIntersect: 'on-intersect', onSignalPatch: 'on-signal-patch', onResize: 'on-resize', onRaf: 'on-raf', matchMedia: 'match-media', scrollIntoView: 'scroll-into-view', customValidity: 'custom-validity', queryString: 'query-string', replaceUrl: 'replace-url', viewTransition: 'view-transition', httpGet: '@get', httpPost: '@post', httpPut: '@put', httpPatch: '@patch', httpDelete: '@delete', applyElements: 'patch-elements (morph)', applyState: 'patch-signals', peek: '@peek', setAll: '@setAll', toggleAll: '@toggleAll', fit: '@fit', clipboard: '@clipboard', intl: '@intl' }

const json = process.argv.includes('--json')
const bundles = []
for (const [name, src] of Object.entries(cases)) bundles.push({ name, ...(await build(src)) })
const core = bundles[0]
const perPlugin = []
if (json || process.argv.includes('--plugins')) {
  for (const p of plugins) {
    const s = await build(withPlugins([p]))
    perPlugin.push({ export: p, name: attrNames[p] ?? p, raw: s.raw - core.raw, gzip: s.gzip - core.gzip, brotli: s.brotli - core.brotli })
  }
}
if (json) {
  const out = { measuredAt: new Date().toISOString().slice(0, 10), bundles, perPlugin }
  const file = process.argv[process.argv.indexOf('--json') + 1]
  if (file && !file.startsWith('-')) writeFileSync(file, JSON.stringify(out, null, 2))
  else console.log(JSON.stringify(out, null, 2))
} else {
  console.log('case'.padEnd(46), '   raw   gzip brotli')
  for (const b of bundles) console.log(b.name.padEnd(46), String(b.raw).padStart(6), String(b.gzip).padStart(6), String(b.brotli).padStart(6))
  if (perPlugin.length) {
    console.log('\nplugin (delta over core)'.padEnd(46), '   raw   gzip brotli')
    for (const p of perPlugin.sort((a, b) => b.gzip - a.gzip)) console.log(p.name.padEnd(46), String(p.raw).padStart(6), String(p.gzip).padStart(6), String(p.brotli).padStart(6))
  }
}

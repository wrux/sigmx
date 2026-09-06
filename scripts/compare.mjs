// Measure other libraries at pinned versions for the comparison on the docs site. Network access required.
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import { writeFileSync } from 'node:fs'
const libs = [
  { name: 'htmx', version: '2.0.10', url: 'https://unpkg.com/htmx.org@2.0.10/dist/htmx.min.js', note: 'htmx.min.js, core only' },
  { name: 'Datastar', version: '1.0.3', url: 'https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.3/bundles/datastar.js', note: 'datastar.js, free plugins only' },
  { name: 'Alpine.js', version: '3.17.1', url: 'https://unpkg.com/alpinejs@3.17.1/dist/cdn.min.js', note: 'cdn.min.js, core only' },
]
const out = []
for (const l of libs) {
  const res = await fetch(l.url)
  if (!res.ok) throw new Error(`${l.name}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  out.push({ ...l, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length, brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length })
  console.log(l.name.padEnd(10), l.version.padEnd(8), `raw=${buf.length} gzip=${out.at(-1).gzip} brotli=${out.at(-1).brotli}`)
}
const file = process.argv[2]
if (file) writeFileSync(file, JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), libraries: out }, null, 2))

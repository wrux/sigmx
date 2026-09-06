import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patchElements, patchSignals, removeSignals, executeScript, formatEvent, sse, sseStream, html, json, readSignals, SignalsError } from '../dist/server.js'
import { bootScript } from '../dist/index.js'

test('event formatting', () => {
  assert.equal(formatEvent(patchSignals({ a: 1 }, { id: '7' })), 'id: 7\nevent: sigmx-patch-signals\ndata: signals {"a":1}\n\n')
  assert.equal(formatEvent(patchElements('<p>\n hi\n</p>', { selector: '#x', mode: 'append' })), 'event: sigmx-patch-elements\ndata: selector #x\ndata: mode append\ndata: elements <p>\ndata: elements  hi\ndata: elements </p>\n\n')
  assert.deepEqual(removeSignals(['a.b', 'c']).lines, ['signals {"a":{"b":null},"c":null}'])
  assert.match(executeScript('alert(1)').lines.at(-1), /^elements <script data-init="el.remove\(\)">alert\(1\)<\/script>$/)
})

test('responses carry the right headers', async () => {
  const r = sse(patchSignals({ a: 1 }))
  assert.equal(r.headers.get('content-type'), 'text/event-stream')
  assert.match(await r.text(), /^event: sigmx-patch-signals/)
  const h = html('<b>x</b>', { selector: '#t', mode: 'inner' })
  assert.equal(h.headers.get('sigmx-selector'), '#t')
  assert.equal(h.headers.get('sigmx-mode'), 'inner')
  const j = json({ a: 1 }, { onlyIfMissing: true })
  assert.equal(j.headers.get('sigmx-only-if-missing'), 'true')
})

test('sseStream streams until the callback resolves', async () => {
  const r = sseStream(async (s) => { s.patchSignals({ n: 1 }); await new Promise((f) => setTimeout(f, 5)); s.patchSignals({ n: 2 }) })
  const text = await r.text()
  assert.equal((text.match(/event: /g) ?? []).length, 2)
})

test('readSignals: query, json body, form body, schema', async () => {
  const get = new Request('http://x/?sigmx=' + encodeURIComponent('{"q":"a"}'))
  assert.deepEqual(await readSignals(get), { q: 'a' })
  const post = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"n":2}' })
  assert.deepEqual(await readSignals(post), { n: 2 })
  const form = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'who=me' })
  assert.deepEqual(await readSignals(form), { who: 'me' })
  const schema = { '~standard': { validate: (v) => (typeof v?.n === 'number' ? { value: { n: v.n * 2 } } : { issues: [{ message: 'n must be a number' }] }) } }
  assert.deepEqual(await readSignals(new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"n":2}' }), schema), { n: 4 })
  await assert.rejects(readSignals(get, schema), SignalsError)
})

test('bootScript wires presets, plugin lists and options', () => {
  assert.match(bootScript(), /import \{ all as plugins \} from 'sigmx\/presets\/all'/)
  assert.match(bootScript({ plugins: ['text', 'on'], prefix: 'hx-', expose: false }), /import \{ text, on \} from 'sigmx\/plugins'/)
  assert.doesNotMatch(bootScript({ expose: false }), /window\[/)
})

test('bootScript with precompile uses the table and the fallback flag', async () => {
  const { bootScript } = await import('../dist/index.js')
  assert.match(bootScript({ precompile: true }), /precompiled\(table, runtimeExpressions\(functionCompiler\)\)/)
  assert.match(bootScript({ precompile: { fallback: false } }), /precompiled\(table, undefined\)/)
})

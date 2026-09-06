import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileBody, functionCompiler } from '../../dist/kernel/compile.js';
import { extractExpressions, generateTable, lintSource } from '../../dist/kernel/precompile.js';
import { expressionKey, precompiled } from '../../dist/kernel/precompiled.js';
import { createStore } from '../../dist/kernel/state.js';

test('compileBody is the runtime body: strict mode against the root proxy', () => {
  const s = createStore();
  s.set('n', 2);
  const [body] = compileBody(functionCompiler, '$n = $n + 1; $n * 10', ['el', 'evt']);
  const fn = new Function('$', '__a', 'el', 'evt', body);
  assert.equal(fn(s.$, {}, null, null), 30);
  assert.equal(s.get('n'), 3);
  const [act] = compileBody(functionCompiler, "@post('/x', $n)", ['el', 'evt']);
  assert.deepEqual(new Function('$', '__a', 'el', 'evt', act)(s.$, { post: (...a) => a }, null, null), ['/x', 3]);
});

test('extractExpressions + generateTable + precompiled round trip', async () => {
  const html = `<div data-signals="{ n: 1 }"><b data-text="$n * 2"></b><button data-on:click__debounce.10ms="$n++"></button><i data-unknown="x"></i><input data-mask="(999) 99" data-mask__dynamic="$m"></div>`;
  const items = extractExpressions(html, [
    { name: 'signals' },
    { name: 'text' },
    { name: 'on' },
    { name: 'mask', literal: true },
  ]);
  assert.deepEqual(
    items.map((i) => i.src),
    ['{ n: 1 }', '$n * 2', '$n++', '$m'],
    'literal values are skipped unless __dynamic',
  );
  const mod = generateTable(items);
  const url = `data:text/javascript,${encodeURIComponent(mod)}`;
  const { table } = await import(url);
  assert.equal(Object.keys(table).length, 4);
  const s = createStore();
  const misses = [];
  const compile = precompiled(table, undefined, (src) => misses.push(src));
  compile('{ n: 1 }', ['el', 'evt'])(s, {}, null, null); // declare via signals-like evaluation
  const text = compile('$n * 2', ['el', 'evt']);
  s.set('n', 4);
  assert.equal(text(s, {}, null, null), 8);
  compile('$n++', ['el', 'evt'])(s, {}, null, null);
  assert.equal(s.get('n'), 5);
  assert.throws(() => compile('not in table', ['el', 'evt']));
  assert.deepEqual(misses, ['not in table']);
  assert.equal(
    expressionKey(' $n * 2 '),
    '$n * 2',
    'keyed by source only: a plugin gaining an argument keeps old tables valid',
  );
  assert.deepEqual(lintSource('<input data-bind:firstName data-bind:last-name data-text="$firstName">'), [
    'data-bind:firstName: attribute names are lowercased by HTML; write the key in kebab-case',
  ]);
});

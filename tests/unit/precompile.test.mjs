import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileBody, extractExpressions, generateTable, rewriteSignals } from '../../dist/kernel/precompile.js';
import { expressionKey, precompiled } from '../../dist/kernel/precompiled.js';
import { createStore } from '../../dist/kernel/state.js';

test('rewriteSignals turns $name into $.name and leaves strings, $ and obj.$x alone', () => {
  assert.equal(rewriteSignals('$count++'), '$.count++');
  assert.equal(rewriteSignals('$user.name + "$not" + \'$no\''), '$.user.name + "$not" + \'$no\'');
  assert.equal(rewriteSignals('`hi ${$name} and ${$a.b + `${$c}`}`'), '`hi ${$.name} and ${$.a.b + `${$.c}`}`');
  assert.equal(rewriteSignals("$['a-b'] + $.x + obj.$y + $$z"), "$['a-b'] + $.x + obj.$y + $$z");
  assert.equal(rewriteSignals('a$b'), 'a$b');
});

test('compileBody matches runtime semantics and runs in strict mode against the root proxy', () => {
  const s = createStore();
  s.set('n', 2);
  const body = compileBody('$n = $n + 1; $n * 10', true);
  const fn = new Function('$', '__a', 'el', 'evt', `"use strict";${body}`);
  assert.equal(fn(s.$, {}, null, null), 30);
  assert.equal(s.get('n'), 3);
  const act = new Function('$', '__a', 'el', 'evt', `"use strict";${compileBody("@post('/x', $n)", true)}`);
  assert.deepEqual(act(s.$, { post: (...a) => a }, null, null), ['/x', 3]);
});

test('extractExpressions + generateTable + precompiled round trip', async () => {
  const html = `<div data-signals="{ n: 1 }"><b data-text="$n * 2"></b><button data-on:click__debounce.10ms="$n++"></button><i data-unknown="x"></i></div>`;
  const items = extractExpressions(html, [{ name: 'signals' }, { name: 'text' }, { name: 'on', returns: false }]);
  assert.deepEqual(
    items.map((i) => i.src),
    ['{ n: 1 }', '$n * 2', '$n++'],
  );
  const mod = generateTable(items);
  const url = `data:text/javascript,${encodeURIComponent(mod)}`;
  const { table } = await import(url);
  assert.equal(Object.keys(table).length, 3);
  const s = createStore();
  const misses = [];
  const compile = precompiled(table, undefined, (src) => misses.push(src));
  compile('{ n: 1 }', ['el', 'evt'], true)(s, {}, null, null); // declare via signals-like evaluation
  const text = compile('$n * 2', ['el', 'evt'], true);
  s.set('n', 4);
  assert.equal(text(s, {}, null, null), 8);
  compile('$n++', ['el', 'evt'], false)(s, {}, null, null);
  assert.equal(s.get('n'), 5);
  assert.throws(() => compile('not in table', ['el', 'evt'], true));
  assert.deepEqual(misses, ['not in table']);
  assert.equal(expressionKey(' $n * 2 ', ['el', 'evt'], true), '1|el,evt|$n * 2');
});

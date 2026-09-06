// Regression tests for the hardening pass: each test names the failure it guards against.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile, functionCompiler, transform } from '../../dist/kernel/compile.js';
import { generateTable } from '../../dist/kernel/precompile.js';
import { computed, effect, rootEffect, signal } from '../../dist/kernel/reactive.js';
import { createStore } from '../../dist/kernel/state.js';
import { recase } from '../../dist/lib/casing.js';
import { expand, toPredicate } from '../../dist/lib/objects.js';
import { readEvents } from '../../dist/lib/sse.js';
import {
  fieldsToObject,
  formatEvent,
  patchElements,
  patchSignals,
  readSignals,
  SignalsError,
  sseStream,
} from '../../dist/server.js';

test('patches cannot pollute Object.prototype', () => {
  const s = createStore();
  s.merge(JSON.parse('{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"x": 1}}, "ok": 1}'));
  assert.equal({}.polluted, undefined);
  assert.equal({}.x, undefined);
  assert.equal(s.get('ok'), 1);
  s.set('a.__proto__.b', 2);
  assert.equal({}.b, undefined);
  expand({}, '__proto__.evil', 1);
  assert.equal({}.evil, undefined);
});

test("a computed that throws while an effect refreshes is routed to that effect's onError", () => {
  const a = signal(1);
  const c = computed(() => {
    if (a.value > 1) throw new Error('boom');
    return a.value;
  });
  const reported = [];
  effect(
    () => c.value,
    (e) => reported.push(e.message),
  );
  a.value = 2; // must not throw here
  assert.deepEqual(reported, ['boom']);
});

test('an effect loop does not disable the other queued effects', () => {
  const a = signal(0);
  let runs = 0;
  effect(() => {
    a.value;
    runs++;
  });
  assert.throws(() => effect(() => a.value++), /effect loop/);
  const before = runs;
  a.value = -1;
  assert.ok(runs > before, 'the innocent effect still runs');
});

test('one effect throwing without onError does not starve the others', () => {
  const a = signal(0);
  let good = 0;
  effect(() => {
    if (a.value > 0) throw new Error('bad');
  });
  effect(() => {
    a.value;
    good++;
  });
  assert.throws(() => (a.value = 1), /bad/);
  assert.equal(good, 2);
});

test('array proxies are cached per signal: the same array under two paths notifies both', () => {
  const s = createStore();
  const arr = [1];
  s.set('a', arr);
  s.set('b', arr);
  const seen = [];
  effect(() => seen.push(`b${s.get('b').length}`));
  s.get('a'); // creates a proxy for path a first
  s.get('b').push(2);
  assert.deepEqual(seen, ['b1', 'b2']);
  s.remove('a');
  s.set('a', arr);
  const again = [];
  effect(() => again.push(s.get('a').length));
  s.get('a').push(3);
  assert.deepEqual(again, [2, 3], 're-setting the same array does not keep a dead proxy');
});

test('frozen data inside a signal is readable through the proxy', () => {
  const s = createStore();
  s.set('items', Object.freeze([{ a: 1 }]));
  assert.equal(s.get('items')[0].a, 1);
});

test('storing a proxied array stores the raw array', () => {
  const s = createStore();
  s.set('items', [1]);
  s.set('copy', s.get('items'));
  assert.equal(Array.isArray(s.snapshot().copy), true);
  s.set('items', s.get('items')); // same array back: no change
  assert.deepEqual(s.snapshot().items, [1]);
});

test('recase keeps leading underscores, knows all four styles, rejects unknown ones', () => {
  assert.equal(recase('_draft', 'camel'), '_draft');
  assert.equal(recase('user.first-name', 'camel'), 'user.firstName');
  assert.equal(recase('first-name', 'snake'), 'first_name');
  assert.equal(recase('first-name', 'pascal'), 'FirstName');
  assert.throws(() => recase('x', 'shouty'), /unknown case "shouty"/);
});

test('merge respects ifMissing and computed leaves even when the patch value is an object', () => {
  const s = createStore();
  s.set('user', 5);
  s.merge({ user: { name: 'a' } }, { ifMissing: true });
  assert.equal(s.get('user'), 5);
  s.define(
    'd',
    computed(() => 1),
  );
  s.merge({ d: { x: 1 } });
  assert.equal(s.get('d'), 1);
  s.merge({}, { at: 'user' });
  assert.equal(s.get('user'), 5, 'an empty patch does not create a namespace over a leaf');
});

test('reading a namespace subscribes to shape changes', () => {
  const s = createStore();
  s.set('u.name', 'a');
  const seen = [];
  effect(() => seen.push(typeof s.get('u')));
  s.set('u', 1);
  assert.deepEqual(seen, ['object', 'number']);
});

test('computeds defined in the store are disposed when their path goes', () => {
  const s = createStore();
  const n = signal(1);
  let computes = 0;
  s.define(
    'c',
    computed(() => {
      computes++;
      return n.value;
    }),
  );
  s.get('c');
  s.remove('c');
  n.value = 2;
  n.value = 3;
  assert.equal(computes, 1, 'a disposed computed no longer recalculates');
});

test('rootEffect is not owned by the running effect', () => {
  const trigger = signal(0);
  const n = signal(1);
  const seen = [];
  effect(() => {
    trigger.value;
    rootEffect(() => seen.push(n.value));
  });
  trigger.value = 1; // parent re-runs; a plain child effect would be disposed here
  n.value = 2;
  assert.deepEqual(seen, [1, 1, 2, 2]);
});

test('an effect whose first run throws is not left subscribed', () => {
  const a = signal(0);
  assert.throws(() =>
    effect(() => {
      if (a.value >= 0) throw new Error('first');
    }),
  );
  assert.doesNotThrow(() => (a.value = 1));
});

test('paths and snapshot can leave computeds out; filters with /g regexes are stable', () => {
  const s = createStore();
  s.set('a', 1);
  s.define(
    'c',
    computed(() => 2),
  );
  assert.deepEqual(s.paths(undefined, { computed: false }), ['a']);
  const ok = toPredicate({ include: /a/g });
  assert.deepEqual([ok('a'), ok('a'), ok('a')], [true, true, true]);
});

test('compile returns the last statement, caches, and rewrites actions inside template holes', () => {
  const s = createStore();
  s.set('n', 2);
  assert.equal(compile(functionCompiler, '$n = 5; $n + 1', ['el', 'evt'])(s.$, {}, null, null), 6);
  const tpl = compile(functionCompiler, '`v=${@fit($n)} ${"@no("}`', ['el', 'evt']);
  assert.equal(tpl(s.$, { fit: (x) => x * 2 }, null, null), 'v=10 @no(');
  assert.equal(transform("'@a(' + @b(1)"), "'@a(' + __a.b(1)");
});

test('the precompiler syntax check is strict, like the emitted module', () => {
  const table = generateTable([{ src: 'with($){ 1 }', params: ['el', 'evt'] }]);
  assert.equal(
    table.includes('with('),
    false,
    'a sloppy-only body is left to the runtime instead of breaking the table',
  );
});

test('readEvents handles a large event split across many chunks and CRLF separators', async () => {
  const big = 'x'.repeat(200_000);
  const text = `event: a\r\ndata: k ${big}\r\n\r\nevent: b\ndata: k 1\n\n`;
  const enc = new TextEncoder().encode(text);
  const body = new ReadableStream({
    start(c) {
      for (let i = 0; i < enc.length; i += 4096) c.enqueue(enc.slice(i, i + 4096));
      c.close();
    },
  });
  const events = [];
  const t0 = Date.now();
  await readEvents(body, (e) => events.push([e.event, e.data.length]));
  assert.deepEqual(events, [
    ['a', big.length + 2],
    ['b', 3],
  ]);
  assert.ok(Date.now() - t0 < 1000);
});

test('server: multi-line values and newlines in ids cannot inject fields; readSignals is strict', async () => {
  const evil = patchElements('<p></p>', { selector: '#a\ndata: elements <script>x()</script>', id: 'a\nid: b' });
  const wire = formatEvent(evil);
  assert.equal(wire.split('\n').filter((l) => l.startsWith('id:')).length, 1);
  assert.match(wire, /data: selector #a\ndata: selector data: elements/);
  assert.deepEqual(
    await readSignals(new Request('http://x/s?q=hi&tag=a&tag=b')),
    { q: 'hi', tag: ['a', 'b'] },
    'a form GET without the sigmx parameter reads the query as fields',
  );
  await assert.rejects(
    readSignals(new Request('http://x/s?sigmx=%5B1%5D')),
    (e) => e instanceof SignalsError && e.status === 400,
  );
  const schema = {
    '~standard': { validate: () => ({ issues: [{ message: 'required', path: ['user', { key: 'email' }] }] }) },
  };
  await assert.rejects(readSignals(new Request('http://x/s'), schema), /user\.email: required/);
  assert.deepEqual(
    fieldsToObject([
      ['a', '1'],
      ['a', '2'],
      ['b', '3'],
    ]),
    { a: ['1', '2'], b: '3' },
  );
});

test('server: a throwing sseStream callback ends the stream with an error', async () => {
  const res = sseStream(async (s) => {
    s.patchSignals({ a: 1 });
    throw new Error('halfway');
  });
  const reader = res.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /patch-signals/);
  await assert.rejects(reader.read(), /halfway/);
  assert.equal(res.headers.get('connection'), null);
  assert.equal(patchSignals({ a: 1 }).lines[0], 'signals {"a":1}');
});

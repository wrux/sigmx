import assert from 'node:assert/strict';
import { test } from 'node:test';
import { camel, kebab, pascal, recase, snake } from '../../dist/lib/casing.js';
import { expand, isPlain, toPredicate } from '../../dist/lib/objects.js';
import { debounce, delay, throttle, toMs, withTiming } from '../../dist/lib/schedule.js';
import { parseFields, readEvents } from '../../dist/lib/sse.js';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('casing helpers', () => {
  assert.equal(camel('user-first_name'), 'userFirstName');
  assert.equal(kebab('userFirstName'), 'user-first-name');
  assert.equal(snake('UserFirstName'), 'user_first_name');
  assert.equal(pascal('user-first-name'), 'UserFirstName');
  assert.equal(recase('user.first-name', 'camel'), 'user.firstName');
  assert.equal(recase('a.b-c', 'kebab'), 'a.b-c');
});

test('object helpers: isPlain, expand and filters', () => {
  assert.equal(isPlain({}), true);
  assert.equal(isPlain(Object.create(null)), true);
  assert.equal(isPlain([]), false);
  assert.equal(isPlain(new Date()), false);
  assert.deepEqual(expand({ a: { keep: 1 } }, 'a.b.c', 2), { a: { keep: 1, b: { c: 2 } } });
  assert.deepEqual(expand({ a: 'scalar' }, 'a.b', 1), { a: { b: 1 } });
  const inc = toPredicate({ include: /^user\./ });
  assert.equal(inc('user.name'), true);
  assert.equal(inc('other'), false);
  const exc = toPredicate({ exclude: '/^_/' });
  assert.equal(exc('_private'), false);
  assert.equal(exc('public'), true);
  assert.equal(toPredicate()('anything'), true);
  assert.equal(toPredicate((p) => p === 'x')('x'), true);
});

test('toMs parses durations and falls back', () => {
  assert.equal(toMs(['300ms']), 300);
  assert.equal(toMs(['2s']), 2000);
  assert.equal(toMs(['150']), 150);
  assert.equal(toMs(['leading', '1.5s']), 1500);
  assert.equal(toMs(['leading'], 250), 250);
  assert.equal(toMs(undefined, 7), 7);
});

test('debounce waits for quiet, with leading and trailing options', async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 20);
  d(1);
  d(2);
  d(3);
  assert.deepEqual(calls, []);
  await tick(35);
  assert.deepEqual(calls, [3]);
  const lead = debounce((x) => calls.push(x), 20, true, false);
  lead('a');
  lead('b');
  await tick(35);
  assert.deepEqual(calls, [3, 'a']);
});

test('throttle limits to one call per window, optionally trailing', async () => {
  const calls = [];
  const th = throttle((x) => calls.push(x), 20);
  th(1);
  th(2);
  assert.deepEqual(calls, [1]);
  await tick(30);
  th(3);
  assert.deepEqual(calls, [1, 3]);
  const trailing = throttle((x) => calls.push(x), 20, true, true);
  trailing('a');
  trailing('b');
  await tick(30);
  assert.deepEqual(calls, [1, 3, 'a', 'b']);
});

test('delay and withTiming compose modifiers', async () => {
  const calls = [];
  delay((x) => calls.push(x), 5)('d');
  assert.deepEqual(calls, []);
  await tick(15);
  assert.deepEqual(calls, ['d']);
  const mods = new Map([['debounce', ['10ms', 'leading', 'notrailing']]]);
  const fn = withTiming((x) => calls.push(x), mods);
  fn(1);
  fn(2);
  await tick(20);
  assert.deepEqual(calls, ['d', 1]);
});

test('readEvents parses chunked event streams with ids, retry and comments', async () => {
  const chunks = [
    'event: a\nid: 1\ndata: x 1\ndata: y',
    ' 2\n\n: comment\nretry: 250\r\nevent: b\r\ndata: z\r\n\r\ndata: tail',
  ];
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(encoder.encode(ch));
      c.close();
    },
  });
  const events = [];
  await readEvents(body, (e) => events.push(e));
  assert.deepEqual(events, [
    { event: 'a', data: 'x 1\ny 2', id: '1', retry: undefined },
    { event: 'b', data: 'z', id: '1', retry: 250 },
    { event: 'message', data: 'tail', id: '1', retry: 250 },
  ]);
});

test('parseFields splits key and value and joins repeated keys', () => {
  assert.deepEqual(parseFields('selector #x\nelements <p>\nelements </p>\nflag'), {
    selector: '#x',
    elements: '<p>\n</p>',
    flag: '',
  });
});

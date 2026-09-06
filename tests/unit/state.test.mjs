import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computed, effect } from '../../dist/kernel/reactive.js';
import { createStore } from '../../dist/kernel/state.js';

test('set/get/merge with nested paths and JSON merge-patch semantics', () => {
  const s = createStore();
  s.set('user', { name: 'a', tags: ['x'] });
  assert.equal(s.get('user.name'), 'a');
  s.merge({ user: { name: 'b', age: 3 } });
  assert.deepEqual(s.snapshot(), { user: { name: 'b', tags: ['x'], age: 3 } });
  s.merge({ user: { age: null } });
  assert.equal(s.has('user.age'), false);
  s.merge({ user: { name: 'z' } }, { ifMissing: true });
  assert.equal(s.get('user.name'), 'b');
});

test('reading an unknown path returns undefined and re-runs once it exists', () => {
  const s = createStore();
  const seen = [];
  effect(() => seen.push(s.get('later')));
  s.set('later', 1);
  assert.deepEqual(seen, [undefined, 1]);
});

test('arrays notify on in-place mutation; computeds live in the store', () => {
  const s = createStore();
  s.set('items', [1]);
  s.define(
    'count',
    computed(() => s.get('items').length),
  );
  const seen = [];
  effect(() => seen.push(s.get('count')));
  s.get('items').push(2);
  assert.deepEqual(seen, [1, 2]);
  assert.throws(() => s.set('count', 9));
});

test('patch events are batched and nested; removals are null', () => {
  const s = createStore();
  const patches = [];
  s.onPatch((p) => patches.push(p));
  s.merge({ a: { b: 1 }, c: 2 });
  s.remove('c');
  assert.deepEqual(patches, [{ a: { b: 1 }, c: 2 }, { c: null }]);
});

test('scope proxy resolves $names for `with` and the root as $', () => {
  const s = createStore();
  s.set('count', 1);
  const fn = new Function('$', 'with($){ $count++; $user = { name: "n" }; return [$count, $.user.name, $["count"]] }');
  assert.deepEqual(fn(s.scope), [2, 'n', 2]);
  assert.equal(JSON.stringify(s.$), '{"count":2,"user":{"name":"n"}}');
});

test('merge skips computed leaves instead of failing the whole patch', () => {
  const s = createStore();
  s.set('a', 1);
  s.define(
    'double',
    computed(() => s.get('a') * 2),
  );
  s.merge({ double: 99, a: 5 });
  assert.equal(s.get('a'), 5);
  assert.equal(s.get('double'), 10);
});

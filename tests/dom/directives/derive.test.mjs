import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('computed: keyed expression and object of functions; non-functions are an error', async (t) => {
  const { $, render, errors } = app(t);
  $.n = 2;
  await render(
    '<div data-computed:double="$n * 2" data-computed="{ triple: () => $n * 3, label: () => `n=${$n}` }"></div>',
  );
  assert.equal($.double, 4);
  assert.equal($.triple, 6);
  $.n = 5;
  assert.equal($.double, 10);
  assert.equal($.label, 'n=5');
  await render('<div data-computed="{ bad: 1 }"></div>');
  assert.match(errors.at(-1).message, /"bad" must be a function/);
});

test('computed values are skipped by merges and excluded from snapshots when asked', async (t) => {
  const { $, render, store } = app(t);
  $.n = 1;
  await render('<div data-computed:double="$n * 2"></div>');
  store.merge({ double: 100, n: 3 });
  assert.equal($.double, 6);
  assert.deepEqual(store.snapshot(undefined, { computed: false }), { n: 3 });
});

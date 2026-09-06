import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('computed: keyed expression', async (t) => {
  const { $, render, errors } = app(t);
  $.n = 2;
  await render('<div data-computed:double="$n * 2"></div>');
  assert.equal($.double, 4);
  $.n = 5;
  assert.equal($.double, 10);
  assert.equal(errors.length, 0);
});

test('computed values are skipped by merges and excluded from snapshots when asked', async (t) => {
  const { $, render, store } = app(t);
  $.n = 1;
  await render('<div data-computed:double="$n * 2"></div>');
  store.merge({ double: 100, n: 3 });
  assert.equal($.double, 6);
  assert.deepEqual(store.snapshot(undefined, { computed: false }), { n: 3 });
});

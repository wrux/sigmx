import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('init runs once on mount', async (t) => {
  const { $, render } = app(t);
  $.n = 0;
  await render('<div data-init="$n++"></div>');
  assert.equal($.n, 1);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('effect runs now and on every dependency change', async (t) => {
  const { $, render } = app(t);
  $.n = 1;
  window.__log = [];
  await render('<div data-effect="window.__log.push($n)"></div>');
  $.n = 2;
  $.n = 2;
  $.n = 3;
  assert.deepEqual(window.__log, [1, 2, 3]);
});

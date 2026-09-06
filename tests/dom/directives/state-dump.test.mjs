import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('json-signals renders the store, optionally filtered', async (t) => {
  const { $, render } = app(t);
  $.a = 1;
  $.b = { c: 2 };
  const el = await render('<div><pre data-json-signals></pre><pre data-json-signals="{ include: /^b/ }"></pre></div>');
  assert.equal(el.children[0].textContent, JSON.stringify({ a: 1, b: { c: 2 } }, null, 2));
  assert.equal(el.children[1].textContent, JSON.stringify({ b: { c: 2 } }, null, 2));
  $.a = 5;
  assert.match(el.children[0].textContent, /"a": 5/);
});

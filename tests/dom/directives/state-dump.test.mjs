import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('json-signals renders the store, terse or filtered', async (t) => {
  const { $, render } = app(t);
  $.a = 1;
  $.b = { c: 2 };
  const el = await render(
    '<div><pre data-json-signals></pre><pre data-json-signals__terse="{ include: /^b/ }"></pre></div>',
  );
  assert.equal(el.children[0].textContent, JSON.stringify({ a: 1, b: { c: 2 } }, null, 2));
  assert.equal(el.children[1].textContent, '{"b":{"c":2}}');
  $.a = 5;
  assert.match(el.children[0].textContent, /"a": 5/);
});

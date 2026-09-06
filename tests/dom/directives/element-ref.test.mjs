import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

test('ref stores the element and clears it on unmount', async (t) => {
  const { $, render, store } = app(t);
  const el = await render('<div><input data-ref:name-field><p data-ref="para"></p></div>');
  assert.equal($.nameField, el.querySelector('input'));
  assert.equal($.para, el.querySelector('p'));
  el.remove();
  await tick();
  assert.equal(store.has('para'), false);
});

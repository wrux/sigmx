import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@setAll assigns every matching path, leaving the rest alone', async (t) => {
  const { $, render } = app(t);
  $.form = { a: 'x', b: 'y', nested: { c: 'z' } };
  $.other = 'keep';
  const el = await render(
    '<div><button id="s" data-on:click="@setAll(\'\', { include: /^form\\./ })"></button><button id="all" data-on:click="@setAll(1)"></button></div>',
  );
  el.querySelector('#s').click();
  assert.deepEqual(JSON.parse(JSON.stringify($.form)), { a: '', b: '', nested: { c: '' } });
  assert.equal($.other, 'keep');
  el.querySelector('#all').click();
  assert.equal($.other, 1);
  assert.equal($.form.a, 1);
});

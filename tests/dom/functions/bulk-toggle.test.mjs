import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@toggleAll negates every matching signal', async (t) => {
  const { $, render } = app(t);
  $.flags = { p: true, q: false };
  $.other = true;
  const el = await render(
    '<div><button id="t" data-on:click="@toggleAll({ include: /^flags\\./ })"></button><button id="all" data-on:click="@toggleAll()"></button></div>',
  );
  el.querySelector('#t').click();
  assert.deepEqual({ ...$.flags }, { p: false, q: true });
  assert.equal($.other, true);
  el.querySelector('#all').click();
  assert.deepEqual({ ...$.flags }, { p: true, q: false });
  assert.equal($.other, false);
});

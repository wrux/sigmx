import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@confirm asks window.confirm and returns its answer', async (t) => {
  const asked = [];
  const original = window.confirm;
  t.after(() => (window.confirm = original));
  const { $, render } = app(t);
  const el = await render('<button data-on:click="@confirm(\'Delete?\') && ($deleted = true)"></button>');
  window.confirm = (m) => {
    asked.push(m);
    return false;
  };
  el.click();
  assert.equal($.deleted, undefined);
  window.confirm = (m) => {
    asked.push(m);
    return true;
  };
  el.click();
  assert.equal($.deleted, true);
  assert.deepEqual(asked, ['Delete?', 'Delete?']);
});

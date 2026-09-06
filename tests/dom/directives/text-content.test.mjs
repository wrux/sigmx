import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('text renders any value and blanks null or undefined', async (t) => {
  const { $, render } = app(t);
  $.v = 0;
  const el = await render('<span data-text="$v"></span>');
  assert.equal(el.textContent, '0');
  $.v = null;
  assert.equal(el.textContent, '');
  $.v = [1, 2];
  assert.equal(el.textContent, '1,2');
});

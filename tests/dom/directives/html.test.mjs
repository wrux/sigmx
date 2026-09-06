import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('html sets innerHTML reactively', async (t) => {
  const { $, render } = app(t);
  $.m = '<b>one</b>';
  const el = await render('<div data-html="$m"></div>');
  assert.equal(el.innerHTML, '<b>one</b>');
  $.m = null;
  assert.equal(el.innerHTML, '');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

test('show toggles display: none and restores the inline display it found', async (t) => {
  const { $, render } = app(t);
  $.open = false;
  const el = await render('<div style="display: flex" data-show="$open"></div>');
  assert.equal(el.style.display, 'none');
  $.open = true;
  assert.equal(el.style.display, 'flex');
  el.removeAttribute('data-show');
  await tick();
  assert.equal(el.style.display, 'flex');
  const hidden = await render('<div style="display: none" data-show="$open"></div>');
  assert.equal(hidden.style.display, '', 'an initial display:none is not treated as the visible state');
});

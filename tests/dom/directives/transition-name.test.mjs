import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('view-transition sets the view-transition-name style', async (t) => {
  const { $, render } = app(t);
  $.name = 'card';
  const el = await render('<div data-view-transition="$name"></div>');
  assert.equal(el.style.getPropertyValue('view-transition-name'), 'card');
});

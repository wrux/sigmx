import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick, until } from '../helpers.mjs';

test('on-interval ticks until unmounted', async (t) => {
  const { $, render } = app(t);
  $.n = 0;
  const el = await render('<div data-on-interval__duration.10ms="$n++"></div>');
  assert.equal($.n, 0);
  await until(() => $.n >= 2);
  el.remove();
  await tick();
  const n = $.n;
  await tick(30);
  assert.equal($.n, n, 'stopped after removal');
});

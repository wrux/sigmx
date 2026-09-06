import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick, until } from '../helpers.mjs';

test('on-raf runs every frame until unmounted', async (t) => {
  const { $, render } = app(t);
  $.frames = 0;
  const el = await render('<div data-on-raf="$frames++"></div>');
  await until(() => $.frames >= 2, 3000);
  el.remove();
  await tick();
  const n = $.frames;
  await tick(60);
  assert.equal($.frames, n);
});

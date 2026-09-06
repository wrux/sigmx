import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick, until } from '../helpers.mjs';

test('on-interval ticks until unmounted; leading fires immediately', async (t) => {
  const { $, render } = app(t);
  $.n = 0;
  $.m = 0;
  const el = await render(
    '<div data-on-interval__duration.10ms="$n++"><i data-on-interval__duration.60ms.leading="$m++"></i></div>',
  );
  assert.equal($.m, 1);
  assert.equal($.n, 0);
  await until(() => $.n >= 2);
  el.remove();
  await tick();
  const n = $.n;
  await tick(30);
  assert.equal($.n, n, 'stopped after removal');
});

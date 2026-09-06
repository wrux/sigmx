import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@fit maps ranges with optional clamp and round', async (t) => {
  const { $, render } = app(t);
  await render(
    '<div data-signals="{ a: @fit(5, 0, 10, 0, 100), b: @fit(15, 0, 10, 0, 100, true), c: @fit(1, 0, 3, 0, 10, false, true) }"></div>',
  );
  assert.equal($.a, 50);
  assert.equal($.b, 100);
  assert.equal($.c, 3);
});

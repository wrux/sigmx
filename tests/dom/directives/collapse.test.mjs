import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, until } from '../helpers.mjs';

test('collapse settles closed and open, animating height in between', async (t) => {
  const { $, render } = app(t);
  $.open = false;
  const el = await render('<div data-collapse__duration.30ms="$open"><p>content</p></div>');
  assert.equal(el.style.height, '0px');
  assert.equal(el.style.overflow, 'hidden');
  $.open = true;
  assert.match(el.style.transition, /height 30ms/);
  await until(() => el.style.transition === '' && el.style.height === '', 1000);
  assert.equal(el.style.overflow, '');
  $.open = false;
  assert.equal(el.style.overflow, 'hidden');
  await until(() => el.style.transition === '' && el.style.height === '0px', 1000);
});

test('collapse ignores changes that do not flip the outcome', async (t) => {
  const { $, render } = app(t);
  $.n = 0;
  const el = await render('<div data-collapse="$n > 2"></div>');
  assert.equal(el.style.height, '0px');
  $.n = 1;
  assert.equal(el.style.transition, '', 'still closed: nothing animated');
  $.n = 3;
  assert.notEqual(el.style.transition, '');
});

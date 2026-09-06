import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@peek reads without subscribing', async (t) => {
  const { $, render } = app(t);
  $.x = 1;
  $.y = 10;
  await render('<div data-computed:sum="@peek(() => $x) + $y"></div>');
  assert.equal($.sum, 11);
  $.x = 5;
  assert.equal($.sum, 11, 'x is not a dependency');
  $.y = 20;
  assert.equal($.sum, 25, 're-evaluated for y, picking up the new x');
});

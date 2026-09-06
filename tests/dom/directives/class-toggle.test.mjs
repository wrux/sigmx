import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

test('class: keyed (kebab), object form with multi-class keys, cleanup on unmount', async (t) => {
  const { $, render } = app(t);
  $.on = true;
  $.big = false;
  const el = await render('<div class="base" data-class:is-active="$on" data-class="{ \'big wide\': $big }"></div>');
  assert.equal(el.className, 'base is-active');
  $.big = true;
  $.on = false;
  assert.deepEqual([...el.classList].sort(), ['base', 'big', 'wide']);
  el.removeAttribute('data-class');
  await tick();
  assert.equal(el.className, 'base');
});

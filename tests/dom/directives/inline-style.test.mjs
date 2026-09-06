import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

test('style: keyed and object forms, falsy restores the original inline value, zero is kept', async (t) => {
  const { $, render } = app(t);
  $.c = 'red';
  $.o = 0;
  const el = await render(
    '<div style="color: blue" data-style:color="$c" data-style="{ opacity: $o, zIndex: $z }"></div>',
  );
  assert.equal(el.style.color, 'red');
  assert.equal(el.style.opacity, '0');
  assert.equal(el.style.zIndex, '');
  $.z = 3;
  assert.equal(el.style.zIndex, '3');
  $.c = '';
  assert.equal(el.style.color, 'blue', 'original inline value restored');
  el.removeAttribute('data-style:color');
  await tick();
  assert.equal(el.style.color, 'blue');
});

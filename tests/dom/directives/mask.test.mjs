import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

const input = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

test('mask formats as the user types and bind sees the formatted value; __dynamic follows a signal', async (t) => {
  const { $, render } = app(t);
  const el = await render('<input data-mask="(999) 999-9999" data-bind:phone>');
  input(el, '5551234567');
  assert.equal(el.value, '(555) 123-4567');
  assert.equal($.phone, '(555) 123-4567');
  input(el, '55a5');
  assert.equal(el.value, '(555', 'non-matching characters are skipped');
  $.pattern = '99-99';
  const dyn = await render('<input data-mask__dynamic="$pattern">');
  input(dyn, '1234');
  assert.equal(dyn.value, '12-34');
  $.pattern = '9.9.9';
  assert.equal(dyn.value, '1.2.3', 'reformatted when the pattern changes');
});

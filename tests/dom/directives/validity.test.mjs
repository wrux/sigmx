import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('custom-validity sets the validation message and rejects non-fields', async (t) => {
  const { $, render, errors } = app(t);
  $.msg = 'too short';
  const el = await render('<input data-custom-validity="$msg">');
  assert.equal(el.validity.customError, true);
  assert.equal(el.validationMessage, 'too short');
  $.msg = '';
  assert.equal(el.validity.customError, false);
  await render('<div data-custom-validity="\'x\'"></div>');
  assert.match(errors.at(-1).message, /only works on form fields/);
});

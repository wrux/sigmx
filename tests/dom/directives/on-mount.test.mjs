import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, until } from '../helpers.mjs';

test('init runs once on mount, optionally delayed', async (t) => {
  const { $, render } = app(t);
  $.n = 0;
  await render('<div data-init="$n++"><i data-init__delay.10ms="$late = true"></i></div>');
  assert.equal($.n, 1);
  assert.equal($.late, undefined);
  await until(() => $.late === true);
});

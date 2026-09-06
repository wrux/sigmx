import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('cloak is removed on mount', async (t) => {
  const { render } = app(t);
  const el = await render('<div data-cloak></div>');
  assert.equal(el.hasAttribute('data-cloak'), false);
});

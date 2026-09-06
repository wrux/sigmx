import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('replace-url rewrites the address without navigating', async (t) => {
  const { $, render } = app(t);
  const before = location.href;
  t.after(() => history.replaceState(null, '', before));
  $.q = 'a';
  await render('<div data-replace-url="`/search?q=${$q}`"></div>');
  assert.equal(location.pathname + location.search, '/search?q=a');
  $.q = 'b';
  assert.equal(location.search, '?q=b');
});

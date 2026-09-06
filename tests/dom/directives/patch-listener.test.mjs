import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

test('on-signal-patch receives every patch, or only those touching its key', async (t) => {
  const { $, render } = app(t);
  $.all = [];
  $.user = { name: 'a' };
  await render(
    '<div data-on-signal-patch="$all.push(Object.keys(patch)[0])" data-on-signal-patch:user.name="$hits = ($hits ?? 0) + 1"></div>',
  );
  $.other = 1;
  await tick();
  $.user.name = 'b';
  await tick();
  assert.equal($.hits, 1);
  assert.ok([...$.all].includes('other'));
  assert.ok([...$.all].includes('user'));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('attr: true is a bare attribute, false and null remove, objects serialise as JSON', async (t) => {
  const { $, render } = app(t);
  $.dis = true;
  $.title = 'hi';
  const el = await render(
    '<button data-attr:disabled="$dis" data-attr="{ title: $title, \'aria-label\': $label, \'data-meta\': $meta }"></button>',
  );
  assert.equal(el.getAttribute('disabled'), '');
  assert.equal(el.getAttribute('title'), 'hi');
  assert.equal(el.hasAttribute('aria-label'), false);
  $.dis = false;
  $.label = 'L';
  $.meta = { a: 1 };
  assert.equal(el.hasAttribute('disabled'), false);
  assert.equal(el.getAttribute('aria-label'), 'L');
  assert.equal(el.getAttribute('data-meta'), '{"a":1}');
});

test('attr keys are recased to kebab, and __case overrides it', async (t) => {
  const { $, render } = app(t);
  $.v = 'x';
  const el = await render('<div data-attr:aria-label="$v" data-attr:data-foo-bar="$v"></div>');
  assert.equal(el.getAttribute('aria-label'), 'x');
  assert.equal(el.getAttribute('data-foo-bar'), 'x');
});

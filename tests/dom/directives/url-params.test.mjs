import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('query-string:key declares a default, reads the URL, writes changes and drops the default', async (t) => {
  const before = location.href;
  t.after(() => history.replaceState(null, '', before));
  history.replaceState(null, '', '/list?page=3&other=x');
  const { $, render } = app(t);
  await render('<div data-query-string:page="1" data-query-string:sort="\'name\'"></div>');
  assert.equal($.page, 3, 'URL wins over the default');
  assert.equal($.sort, 'name', 'default when absent');
  $.page = 4;
  assert.equal(new URLSearchParams(location.search).get('page'), '4');
  assert.equal(new URLSearchParams(location.search).get('other'), 'x', 'unrelated params kept');
  $.page = 1;
  assert.equal(new URLSearchParams(location.search).has('page'), false, 'dropped at the default');
  $.sort = 'date';
  assert.equal(new URLSearchParams(location.search).get('sort'), 'date');
});

test('bare query-string mirrors matching signals both ways; __filter drops empties; __history restores on popstate', async (t) => {
  const before = location.href;
  t.after(() => history.replaceState(null, '', before));
  history.replaceState(null, '', '/s?q=hello&n=2');
  const { $, render } = app(t);
  $.q = '';
  $.n = 0;
  $.ignored = 'z';
  await render('<div data-query-string__filter__history="{ include: /^(q|n)$/ }"></div>');
  assert.equal($.q, 'hello');
  assert.equal($.n, 2, 'numbers are parsed');
  $.q = 'bye';
  assert.equal(new URLSearchParams(location.search).get('q'), 'bye');
  assert.equal(new URLSearchParams(location.search).has('ignored'), false);
  $.q = '';
  assert.equal(new URLSearchParams(location.search).has('q'), false, 'filter drops empties');
  history.replaceState(null, '', '/s?q=back&n=9');
  window.dispatchEvent(new PopStateEvent('popstate'));
  assert.equal($.q, 'back');
  assert.equal($.n, 9);
});

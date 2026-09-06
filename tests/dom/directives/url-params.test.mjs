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

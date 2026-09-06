import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('persist restores from storage on mount and saves every change', async (t) => {
  localStorage.clear();
  sessionStorage.clear();
  t.after(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  localStorage.setItem('sigmx', JSON.stringify({ theme: 'dark' }));
  const { $, render } = app(t);
  await render('<div data-signals:theme__ifmissing="\'light\'" data-persist></div>');
  assert.equal($.theme, 'dark');
  $.theme = 'sepia';
  assert.equal(JSON.parse(localStorage.getItem('sigmx')).theme, 'sepia');
  const b = app(t);
  b.$.a = 1;
  b.$.b = 2;
  await b.render('<div data-persist:only-a__session="{ include: /^a$/ }" data-computed:c="$a + $b"></div>');
  assert.deepEqual(JSON.parse(sessionStorage.getItem('only-a')), { a: 1 }, 'filtered and without computeds');
});

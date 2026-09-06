import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('persist survives corrupted storage', async (t) => {
  localStorage.setItem('corrupt', '{not json');
  t.after(() => localStorage.removeItem('corrupt'));
  const { $, render, errors } = app(t);
  await render('<div data-persist:corrupt></div>');
  $.x = 1;
  assert.equal(errors.length, 0);
  assert.deepEqual(JSON.parse(localStorage.getItem('corrupt')), { x: 1 });
});

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
  await b.render('<div data-persist:only-a="{ include: /^a$/ }" data-computed:c="$a + $b"></div>');
  assert.deepEqual(JSON.parse(localStorage.getItem('only-a')), { a: 1 }, 'filtered and without computeds');
});

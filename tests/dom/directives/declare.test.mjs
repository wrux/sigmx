import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('signals: object form, keyed form with recasing, nested merge, __ifmissing', async (t) => {
  const { $, render, store } = app(t);
  await render(
    '<div data-signals="{ count: 1, user: { name: \'Ada\' } }" data-signals:user-age="36" data-signals:count__ifmissing="99"></div>',
  );
  assert.equal($.count, 1);
  assert.equal($.user.name, 'Ada');
  assert.equal($.userAge, 36, 'keys are camel-cased');
  await render('<div data-signals="{ user: { email: \'a@b\' } }"></div>');
  assert.equal($.user.name, 'Ada', 'merge keeps siblings');
  assert.equal($.user.email, 'a@b');
  await render('<div data-signals__ifmissing="{ count: 5, fresh: true }"></div>');
  assert.equal($.count, 1);
  assert.equal($.fresh, true);
  assert.deepEqual(
    store.paths().sort(),
    ['count', 'fresh', 'user.age', 'user.email', 'user.name', 'userAge'].filter((p) => p !== 'user.age'),
  );
});

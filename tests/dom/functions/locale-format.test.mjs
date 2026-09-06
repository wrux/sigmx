import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@intl formats through Intl and rejects unknown kinds', async (t) => {
  const { $, render, errors } = app(t);
  await render(
    "<div data-signals=\"{ money: @intl('number', 1234.5, { style: 'currency', currency: 'USD' }, 'en-US'), list: @intl('list', ['a', 'b'], { type: 'conjunction' }, 'en'), plural: @intl('pluralRules', 1, undefined, 'en') }\"></div>",
  );
  assert.equal($.money, '$1,234.50');
  assert.equal($.list, 'a and b');
  assert.equal($.plural, 'one');
  await render('<div data-init="@intl(\'nope\', 1)"></div>');
  assert.match(errors.at(-1).message, /unknown @intl type "nope"/);
});

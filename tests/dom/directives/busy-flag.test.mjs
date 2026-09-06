import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, mockFetch, native, until } from '../helpers.mjs';

test('indicator is true while a request from the element or its descendants is in flight', async (t) => {
  let release;
  mockFetch(t, () => new Promise((r) => (release = () => r(new native.Response(null, { status: 204 })))));
  const { $, render } = app(t);
  const el = await render(
    '<div data-indicator:busy><button data-on:click="@get(\'/api/ind\')"></button></div><button data-on:click="@get(\'/api/elsewhere\')"></button>',
  );
  assert.equal($.busy, false);
  el.nextElementSibling.click();
  await until(() => release);
  assert.equal($.busy, false, 'requests from outside the element do not count');
  const outer = release;
  release = undefined;
  el.querySelector('button').click();
  await until(() => $.busy === true);
  outer();
  await until(() => release);
  release();
  await until(() => $.busy === false);
});

test('indicator keeps counting a request whose element was morphed away', async (t) => {
  let release;
  mockFetch(t, () => new Promise((r) => (release = () => r(new native.Response(null, { status: 204 })))));
  const { $, render } = app(t);
  const el = await render(
    '<div data-indicator:saving><button id="b" data-on:click="@post(\'/api/morphed\')"></button></div>',
  );
  el.querySelector('#b').click();
  await until(() => $.saving === true);
  el.querySelector('#b').remove();
  release();
  await until(() => $.saving === false);
});

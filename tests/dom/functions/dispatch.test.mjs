import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@dispatch fires a bubbling, composed CustomEvent from the element', async (t) => {
  const { render, stage } = app(t);
  const got = [];
  stage.addEventListener('ping', (e) => got.push({ detail: e.detail, target: e.target.id, composed: e.composed }));
  const el = await render(
    '<div><button id="d" data-on:click="@dispatch(\'ping\', { n: 7 })"></button><button id="e" data-on:click="@dispatch(\'ping\')"></button></div>',
  );
  el.querySelector('#d').click();
  el.querySelector('#e').click();
  assert.deepEqual(got, [
    { detail: { n: 7 }, target: 'd', composed: true },
    { detail: null, target: 'e', composed: true },
  ]);
});

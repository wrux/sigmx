import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

const handle = (sigmx, name, data) => sigmx.runtime.handle(`sigmx-${name}`, data);

test('patch-signals merges JSON or a JS object literal, honouring onlyIfMissing', (t) => {
  const { sigmx, $ } = app(t);
  $.a = 1;
  handle(sigmx, 'patch-signals', { signals: '{"a": 2, "b": {"c": 3}}' });
  assert.equal($.a, 2);
  assert.equal($.b.c, 3);
  handle(sigmx, 'patch-signals', { signals: "{ a: 5, d: 'lit' }" });
  assert.equal($.a, 5);
  assert.equal($.d, 'lit');
  handle(sigmx, 'patch-signals', { signals: '{"a": 9, "e": 1}', onlyIfMissing: 'true' });
  assert.equal($.a, 5);
  assert.equal($.e, 1);
  handle(sigmx, 'patch-signals', { signals: '{"b": null}' });
  assert.equal($.b, undefined);
});

test('a legacy event prefix is accepted when configured', (t) => {
  const { sigmx, $ } = app(t, { eventPrefix: ['sigmx-', 'datastar-'] });
  assert.equal(sigmx.runtime.handle('datastar-patch-signals', { signals: '{"x": 1}' }), true);
  assert.equal($.x, 1);
  const strict = app(t);
  assert.equal(strict.sigmx.runtime.handle('datastar-patch-signals', { signals: '{"x": 1}' }), false);
});

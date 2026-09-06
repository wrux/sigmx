import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('match-media keeps a boolean signal in step with a media query', async (t) => {
  const listeners = new Map();
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  t.after(() => (original ? Object.defineProperty(window, 'matchMedia', original) : delete window.matchMedia));
  const queries = [];
  const mqls = new Map();
  const fake = (q) => {
    queries.push(q);
    const mql = {
      matches: q.includes('dark'),
      media: q,
      addEventListener: (_, fn) => listeners.set(q, fn),
      removeEventListener: () => {},
    };
    mqls.set(q, mql);
    return mql;
  };
  Object.defineProperty(window, 'matchMedia', { value: fake, configurable: true, writable: true });
  const { $, render } = app(t);
  await render(
    '<div data-match-media:is-dark="\'prefers-color-scheme: dark\'" data-match-media:wide="\'min-width: 800px\'"></div>',
  );
  assert.equal($.isDark, true);
  assert.equal($.wide, false);
  assert.deepEqual(queries, ['(prefers-color-scheme: dark)', '(min-width: 800px)'], 'bare queries are wrapped');
  mqls.get('(min-width: 800px)').matches = true;
  listeners.get('(min-width: 800px)')({ matches: true });
  assert.equal($.wide, true);
});

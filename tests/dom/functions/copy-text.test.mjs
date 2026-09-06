import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('@clipboard writes text, decoding base64 when asked', async (t) => {
  const written = [];
  const original = navigator.clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (s) => written.push(s) },
    configurable: true,
  });
  t.after(() => Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true }));
  const { render } = app(t);
  const el = await render(
    '<div><button id="a" data-on:click="@clipboard(\'plain\')"></button><button id="b" data-on:click="@clipboard(\'aGVsbG8=\', true)"></button></div>',
  );
  el.querySelector('#a').click();
  el.querySelector('#b').click();
  assert.deepEqual(written, ['plain', 'hello']);
});

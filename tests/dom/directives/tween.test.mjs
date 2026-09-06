import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, until } from '../helpers.mjs';

// happy-dom has no CSS.supports; treat every property except the SVG `r` attribute as CSS.
const supportsCss = (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
  t.after(() => original && Object.defineProperty(globalThis, 'CSS', original));
  const cssEscape = globalThis.CSS?.escape ?? ((s) => s);
  Object.defineProperty(globalThis, 'CSS', {
    value: { supports: (prop) => prop !== 'r', escape: cssEscape },
    configurable: true,
  });
};

test('animate applies the first value immediately, then tweens numeric changes to the target', async (t) => {
  supportsCss(t);
  const { $, render } = app(t);
  $.o = 0;
  const el = await render('<div data-animate:opacity__duration.40ms="$o"></div>');
  assert.equal(el.style.opacity, '0');
  $.o = 1;
  await until(() => el.style.opacity !== '0' && el.style.opacity !== '1', 1000);
  const mid = Number(el.style.opacity);
  assert.ok(mid > 0 && mid < 1, `mid-tween value ${mid}`);
  await until(() => el.style.opacity === '1', 1000);
});

test('animate applies non-numeric values and unit changes at once, and skips unchanged targets', async (t) => {
  supportsCss(t);
  const { $, render } = app(t);
  $.w = '10px';
  const el = await render('<div data-animate:width__duration.30ms="$w"></div>');
  assert.equal(el.style.width, '10px');
  $.w = 'auto';
  assert.equal(el.style.width, 'auto');
  $.w = '2em';
  assert.equal(el.style.width, '2em', 'different unit: no tween');
  $.w = '2em';
  assert.equal(el.style.width, '2em');
});

test('animate on an SVG attribute writes the attribute instead of a style', async (t) => {
  supportsCss(t);
  const { $, render } = app(t);
  $.r = 5;
  const el = await render('<svg><circle data-animate:r__duration.30ms="$r"></circle></svg>');
  const c = el.querySelector('circle');
  assert.equal(c.getAttribute('r'), '5');
  $.r = 20;
  await until(() => c.getAttribute('r') === '20', 1000);
});

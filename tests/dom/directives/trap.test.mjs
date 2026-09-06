import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

const visible = (t) => {
  const proto = HTMLElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'offsetParent');
  t.after(() => original && Object.defineProperty(proto, 'offsetParent', original));
  Object.defineProperty(proto, 'offsetParent', { get: () => document.body, configurable: true });
};

const tab = (shift = false) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e.defaultPrevented;
};

test('trap moves focus inside, wraps Tab in both directions, and restores focus on release', async (t) => {
  visible(t);
  const { $, render } = app(t);
  $.open = false;
  const el = await render(
    '<div><button id="outside"></button><div data-trap="$open"><button id="a"></button><button id="b"></button></div></div>',
  );
  el.querySelector('#outside').focus();
  $.open = true;
  await tick();
  assert.equal(document.activeElement.id, 'a', 'first focusable receives focus');
  el.querySelector('#b').focus();
  assert.equal(tab(), true, 'Tab from the last item is intercepted');
  assert.equal(document.activeElement.id, 'a');
  assert.equal(tab(true), true, 'Shift+Tab from the first wraps back');
  assert.equal(document.activeElement.id, 'b');
  $.open = false;
  assert.equal(document.activeElement.id, 'outside');
  assert.equal(tab(), false, 'inactive: keys pass through');
});

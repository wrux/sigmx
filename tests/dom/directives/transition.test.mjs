import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

const fakeAnimate = (t) => {
  const calls = [];
  const proto = Element.prototype;
  const original = proto.animate;
  t.after(() => (proto.animate = original));
  proto.animate = (keyframes, options) => {
    const anim = { keyframes, options, cancelled: false, cancel: () => (anim.cancelled = true), onfinish: null };
    calls.push(anim);
    return anim;
  };
  return calls;
};

test('transition sets display on mount and animates later flips, hiding after the exit animation', async (t) => {
  const calls = fakeAnimate(t);
  const { $, render } = app(t);
  $.open = false;
  const el = await render(
    '<div style="display: flex" data-transition__duration.50ms__scale.90__origin.top="$open"></div>',
  );
  assert.equal(el.style.display, 'none');
  assert.equal(el.style.transformOrigin, 'top');
  assert.equal(calls.length, 0, 'no animation on mount');
  $.open = true;
  assert.equal(el.style.display, 'flex');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].keyframes[0], { opacity: 0, transform: 'scale(0.9)' });
  assert.equal(calls[0].options.duration, 50);
  $.open = false;
  assert.equal(calls.length, 2);
  assert.equal(el.style.display, 'flex', 'stays visible until the exit animation finishes');
  calls[1].onfinish();
  assert.equal(el.style.display, 'none');
});

test('transition ignores dependency changes that keep the same outcome', async (t) => {
  const calls = fakeAnimate(t);
  const { $, render } = app(t);
  $.n = 5;
  await render('<div data-transition="$n > 3"></div>');
  $.n = 6;
  $.n = 7;
  assert.equal(calls.length, 0);
  $.n = 1;
  assert.equal(calls.length, 1);
});

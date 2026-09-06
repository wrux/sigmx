import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

const fakeObserver = (t) => {
  const observers = [];
  const original = globalThis.IntersectionObserver;
  t.after(() => (globalThis.IntersectionObserver = original));
  globalThis.IntersectionObserver = class {
    constructor(cb, options) {
      this.cb = cb;
      this.options = options;
      this.disconnected = false;
      observers.push(this);
    }
    observe(el) {
      this.el = el;
    }
    disconnect() {
      this.disconnected = true;
    }
    enter() {
      if (!this.disconnected) this.cb([{ isIntersecting: true }]);
    }
    leave() {
      if (!this.disconnected) this.cb([{ isIntersecting: false }]);
    }
  };
  return observers;
};

test('on-intersect runs on entry, once, on exit, with thresholds', async (t) => {
  const observers = fakeObserver(t);
  const { $, render } = app(t);
  $.seen = 0;
  $.once = 0;
  $.left = 0;
  const el = await render(
    '<div><p data-on-intersect="$seen++"></p><p data-on-intersect__once="$once++"></p><p data-on-intersect__exit="$left++"></p><p data-on-intersect__half="1"></p><p data-on-intersect__threshold.25="1"></p><p data-on-intersect__full="1"></p></div>',
  );
  const [plain, once, exit, half, quarter, full] = observers;
  plain.enter();
  plain.leave();
  plain.enter();
  assert.equal($.seen, 2);
  once.enter();
  once.enter();
  assert.equal($.once, 1);
  assert.equal(once.disconnected, true);
  exit.enter();
  assert.equal($.left, 0);
  exit.leave();
  assert.equal($.left, 1);
  assert.equal(half.options.threshold, 0.5);
  assert.equal(quarter.options.threshold, 0.25);
  assert.equal(full.options.threshold, 1);
  el.remove();
  await tick();
  assert.equal(plain.disconnected, true);
});

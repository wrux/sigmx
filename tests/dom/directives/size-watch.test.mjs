import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick, until } from '../helpers.mjs';

test('on-resize observes the element with ResizeObserver and disconnects on unmount', async (t) => {
  const observers = [];
  const original = globalThis.ResizeObserver;
  t.after(() => (globalThis.ResizeObserver = original));
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(el) {
      this.observed.push(el);
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  const { $, render } = app(t);
  $.n = 0;
  const el = await render(
    '<div data-on-resize="$n++"><i data-on-resize__debounce.10ms="$d = ($d ?? 0) + 1"></i></div>',
  );
  assert.equal(observers.length, 2);
  assert.equal(observers[0].observed[0], el);
  observers[0].cb([]);
  observers[0].cb([]);
  assert.equal($.n, 2);
  observers[1].cb([]);
  observers[1].cb([]);
  await until(() => $.d === 1);
  el.remove();
  await tick();
  assert.equal(observers[0].disconnected, true);
  assert.equal(observers[1].disconnected, true);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('scroll-into-view calls scrollIntoView with the modifiers and can focus', async (t) => {
  const { render } = app(t);
  const calls = [];
  const proto = Element.prototype;
  const original = proto.scrollIntoView;
  t.after(() => (proto.scrollIntoView = original));
  proto.scrollIntoView = (o) => {
    calls.push(o);
  };
  const el = await render(
    '<div><input data-scroll-into-view__instant__vstart__focus><p data-scroll-into-view></p></div>',
  );
  assert.deepEqual(calls, [
    { behavior: 'instant', block: 'start' },
    { behavior: 'smooth', block: 'center' },
  ]);
  assert.equal(document.activeElement, el.querySelector('input'));
});

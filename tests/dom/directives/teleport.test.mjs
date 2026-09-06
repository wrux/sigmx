import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

test('teleport moves the element and reports a missing target', async (t) => {
  const { render, errors, stage } = app(t);
  const target = document.createElement('div');
  target.id = 'tele-target';
  target.innerHTML = '<span>existing</span>';
  document.body.append(target);
  t.after(() => target.remove());
  await render(
    '<div><p id="a" data-teleport="#tele-target">a</p><p id="b" data-teleport="#tele-target">b</p><p data-teleport="#nope"></p></div>',
  );
  assert.equal(target.children[1].id, 'a');
  assert.equal(target.children[2].id, 'b');
  assert.equal(stage.querySelectorAll('p').length, 1);
  assert.match(errors.at(-1).message, /no element matches "#nope"/);
});

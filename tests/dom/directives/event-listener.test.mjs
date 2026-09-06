import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick, until } from '../helpers.mjs';

test('on: runs the expression with evt, once, prevent and stop', async (t) => {
  const { $, render } = app(t);
  $.n = 0;
  const el = await render(
    '<div data-on:click="$outer = ($outer ?? 0) + 1"><button id="a" data-on:click__once="$n++"></button><button id="b" data-on:click__stop="$n++"></button><a id="c" href="#x" data-on:click__prevent="$type = evt.type"></a></div>',
  );
  const a = el.querySelector('#a');
  a.click();
  a.click();
  assert.equal($.n, 1, 'once');
  assert.equal($.outer, 2);
  el.querySelector('#b').click();
  assert.equal($.n, 2);
  assert.equal($.outer, 2, 'stop kept the parent from seeing it');
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  const notCancelled = el.querySelector('#c').dispatchEvent(ev);
  assert.equal(notCancelled, false, 'prevent');
  assert.equal($.type, 'click');
});

test('on: form submit is always prevented; window, document and outside targets', async (t) => {
  const { $, render } = app(t);
  const el = await render(
    '<div><form data-on:submit="$submitted = true"><button type="submit"></button></form><span data-on:keydown__window="$key = evt.key"></span><span data-on:custom-thing__document="$doc = true"></span><div id="box" data-on:click__outside="$out = ($out ?? 0) + 1"><i id="inner"></i></div></div>',
  );
  const submit = new Event('submit', { bubbles: true, cancelable: true });
  assert.equal(el.querySelector('form').dispatchEvent(submit), false);
  assert.equal($.submitted, true);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal($.key, 'Escape');
  document.dispatchEvent(new CustomEvent('custom-thing'));
  assert.equal($.doc, true);
  el.querySelector('#inner').click();
  assert.equal($.out, undefined, 'inside click ignored');
  el.querySelector('form').click();
  assert.equal($.out, 1);
});

test('on: event names are kebab by default and __case changes it', async (t) => {
  const { $, render } = app(t);
  const el = await render('<div data-on:my-event="$a = 1" data-on:my-event__case.camel="$b = 1"></div>');
  el.dispatchEvent(new CustomEvent('my-event'));
  assert.equal($.a, 1);
  assert.equal($.b, undefined);
  el.dispatchEvent(new CustomEvent('myEvent'));
  assert.equal($.b, 1);
});

test('on: debounce, throttle and delay modifiers', async (t) => {
  const { $, render } = app(t);
  $.d = 0;
  $.th = 0;
  $.dl = 0;
  const el = await render(
    '<div><button id="d" data-on:click__debounce.30ms="$d++"></button><button id="t" data-on:click__throttle.30ms="$th++"></button><button id="l" data-on:click__delay.20ms="$dl++"></button></div>',
  );
  const d = el.querySelector('#d');
  d.click();
  d.click();
  d.click();
  assert.equal($.d, 0);
  await until(() => $.d === 1);
  await tick(40);
  assert.equal($.d, 1);
  const th = el.querySelector('#t');
  th.click();
  th.click();
  assert.equal($.th, 1, 'leading');
  await tick(40);
  assert.equal($.th, 1, 'no trailing by default');
  th.click();
  assert.equal($.th, 2);
  el.querySelector('#l').click();
  assert.equal($.dl, 0);
  await until(() => $.dl === 1);
});

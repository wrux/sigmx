import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attribute, handler, parseAttr } from '../../dist/kernel/index.js';
import { text } from '../../dist/plugins/index.js';
import { app, lastEvent, tick } from './helpers.mjs';

test('parseAttr splits plugin, key and modifiers', () => {
  assert.deepEqual(parseAttr('on:click__debounce.300ms__prevent'), {
    plugin: 'on',
    key: 'click',
    mods: new Map([
      ['debounce', ['300ms']],
      ['prevent', []],
    ]),
  });
  assert.deepEqual(parseAttr('text'), { plugin: 'text', key: undefined, mods: new Map() });
  assert.equal(parseAttr('signals:user.name').key, 'user.name');
});

test('a configurable attribute prefix, or several', async (t) => {
  const hx = app(t, { prefix: 'hx-' });
  hx.$.n = 5;
  const el = await hx.render('<span hx-text="$n"></span><i data-text="$n"></i>');
  assert.equal(el.textContent, '5');
  assert.equal(el.nextElementSibling.textContent, '', 'other prefixes are ignored');
  const both = app(t, { prefix: ['data-', 'ds-'] });
  both.$.n = 7;
  const el2 = await both.render('<span ds-text="$n"></span><i data-text="$n"></i>');
  assert.equal(el2.textContent, '7');
  assert.equal(el2.nextElementSibling.textContent, '7');
  assert.equal(both.sigmx.runtime.attr('on'), 'data-on', 'the first prefix is primary');
});

test('ignore skips a subtree; ignore__self skips one element only', async (t) => {
  const { $, render } = app(t);
  $.n = 1;
  const el = await render(
    '<div><section data-ignore><span data-text="$n"></span></section><section data-ignore__self data-text="$n"><b data-text="$n"></b></section></div>',
  );
  assert.equal(el.querySelector('span').textContent, '');
  const self = el.children[1];
  assert.equal(self.childNodes.length, 1, 'own text directive not applied');
  assert.equal(self.querySelector('b').textContent, '1');
});

test('changing an attribute remounts it; removing it unmounts', async (t) => {
  const { $, render } = app(t);
  $.n = 2;
  const el = await render('<b data-text="$n"></b>');
  el.setAttribute('data-text', '$n * 10');
  await tick();
  assert.equal(el.textContent, '20');
  el.removeAttribute('data-text');
  await tick();
  $.n = 3;
  assert.equal(el.textContent, '20', 'no longer bound');
});

test('one failing expression is reported and does not stop the others', async (t) => {
  const { $, render, errors } = app(t);
  $.n = 4;
  const el = await render('<div><i data-text="this is not js (("></i><b data-text="$n"></b></div>');
  assert.equal(el.querySelector('b').textContent, '4');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].info.plugin, 'text');
  assert.equal(errors[0].info.el, el.querySelector('i'));
});

test('plugin contracts: key and value requirements produce clear errors', async (t) => {
  const { render, errors } = app(t);
  await render('<div><i data-text:x="1"></i><i data-on="1"></i><i data-text=""></i><i data-cloak="x"></i></div>');
  const messages = errors.map((e) => e.message);
  assert.ok(
    messages.some((m) => m === 'data-text: takes no key'),
    messages.join('|'),
  );
  assert.ok(messages.some((m) => m === 'data-on: needs a key'));
  assert.ok(messages.some((m) => m === 'data-text: needs a value'));
  assert.ok(messages.some((m) => m === 'data-cloak: takes no value'));
});

test('expressions see el, evt and can call actions; unknown actions are reported', async (t) => {
  const { $, render, errors } = app(t);
  const el = await render(
    '<button data-on:click="$tag = el.tagName; $type = evt.type"></button><button data-on:click="@nope()"></button>',
  );
  el.click();
  assert.equal($.tag, 'BUTTON');
  assert.equal($.type, 'click');
  el.nextElementSibling.click();
  assert.match(errors.at(-1).message, /unknown action @nope/);
});

test('use() registers plugins late and applies them to already-observed roots', async (t) => {
  const { $, sigmx, render } = app(t, { plugins: [] });
  $.n = 9;
  const el = await render('<span data-text="$n"></span>');
  assert.equal(el.textContent, '', 'no text plugin yet');
  sigmx.use(text);
  assert.equal(el.textContent, '9');
  const shout = attribute({
    name: 'shout',
    value: 'required',
    mount: ({ el, evaluate }) => (el.textContent = String(evaluate()).toUpperCase()),
  });
  sigmx.use(shout);
  const el2 = await render('<span data-shout="\'hi\'"></span>');
  assert.equal(el2.textContent, 'HI');
});

test('destroy() unmounts everything and stops observing', async (t) => {
  const { $, sigmx, render, stage } = app(t);
  $.n = 1;
  const el = await render('<span data-text="$n"></span>');
  sigmx.destroy();
  $.n = 2;
  assert.equal(el.textContent, '1');
  stage.innerHTML = '<b data-text="$n"></b>';
  await tick();
  assert.equal(stage.firstElementChild.textContent, '');
});

test('events: ready on first document apply, signal-patch on every settled change', async (t) => {
  const patches = lastEvent(t, 'sigmx-signal-patch');
  const ready = lastEvent(t, 'sigmx-ready');
  const { $, sigmx } = app(t);
  assert.equal(ready.length, 0, 'a stage root is not the document');
  sigmx.apply(document.documentElement);
  assert.equal(ready.length, 1);
  $.user = { name: 'Ada' };
  await tick();
  assert.deepEqual(patches.at(-1), { user: { name: 'Ada' } });
});

test('handle() routes server events by name, stripping any accepted prefix', (t) => {
  const seen = [];
  const custom = handler({ name: 'custom', handle: (_, data) => seen.push(data) });
  const { sigmx, $ } = app(t, { eventPrefix: ['sigmx-', 'legacy-'], plugins: [custom] });
  sigmx.use(...[]);
  assert.equal(sigmx.runtime.handle('sigmx-custom', { a: '1' }), true);
  assert.equal(sigmx.runtime.handle('legacy-custom', { a: '2' }), true);
  assert.equal(sigmx.runtime.handle('custom', { a: '3' }), true);
  assert.equal(sigmx.runtime.handle('sigmx-nothing', {}), false);
  assert.deepEqual(seen, [{ a: '1' }, { a: '2' }, { a: '3' }]);
  assert.equal($.x, undefined);
});

test('shadow roots can be applied and observed', async (t) => {
  const { $, sigmx, render } = app(t);
  $.n = 3;
  const host = await render('<div></div>');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<span data-text="$n"></span>';
  sigmx.apply(root);
  assert.equal(root.firstElementChild.textContent, '3');
  root.innerHTML = '<b data-text="$n + 1"></b>';
  await tick();
  assert.equal(root.firstElementChild.textContent, '4');
});

test('a shared store lets two instances see the same signals', async (t) => {
  const a = app(t);
  const b = app(t, { store: a.store });
  a.$.n = 11;
  const el = await b.render('<span data-text="$n"></span>');
  assert.equal(el.textContent, '11');
});

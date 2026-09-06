import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, tick } from '../helpers.mjs';

const handle = (sigmx, name, data) => sigmx.runtime.handle(`sigmx-${name}`, data);

test('patch-elements without a selector morphs top-level elements by id', async (t) => {
  const { sigmx, render } = app(t);
  const el = await render('<div><p id="a">1</p><p id="b">2</p></div>');
  const a = el.querySelector('#a');
  handle(sigmx, 'patch-elements', { elements: '<p id="a" class="x">one</p>\n<p id="b">two</p>' });
  assert.equal(el.querySelector('#a'), a);
  assert.equal(a.textContent, 'one');
  assert.equal(a.className, 'x');
  assert.equal(el.querySelector('#b').textContent, 'two');
});

test('patch-elements modes against a selector', async (t) => {
  const { sigmx, render } = app(t);
  const el = await render('<div><ul id="l"><li>a</li></ul><p class="two">x</p><p class="two">y</p></div>');
  handle(sigmx, 'patch-elements', { selector: '#l', mode: 'append', elements: '<li>b</li>' });
  handle(sigmx, 'patch-elements', { selector: '#l', mode: 'prepend', elements: '<li>0</li>' });
  assert.equal(el.querySelector('#l').textContent, '0ab');
  handle(sigmx, 'patch-elements', { selector: '#l', mode: 'inner', elements: '<li>only</li>' });
  assert.equal(el.querySelector('#l').innerHTML, '<li>only</li>');
  handle(sigmx, 'patch-elements', { selector: '#l', mode: 'before', elements: '<h2>title</h2>' });
  handle(sigmx, 'patch-elements', { selector: '#l', mode: 'after', elements: '<small>after</small>' });
  assert.equal(el.children[0].tagName, 'H2');
  assert.equal(el.children[2].tagName, 'SMALL');
  handle(sigmx, 'patch-elements', { selector: '.two', mode: 'outer', elements: '<p class="two">z</p>' });
  assert.deepEqual(
    [...el.querySelectorAll('.two')].map((p) => p.textContent),
    ['z', 'z'],
    'every match is patched',
  );
  handle(sigmx, 'patch-elements', { selector: '.two', mode: 'remove' });
  assert.equal(el.querySelectorAll('.two').length, 0);
  handle(sigmx, 'patch-elements', { selector: '#l', mode: 'replace', elements: '<ol id="l"><li>r</li></ol>' });
  assert.equal(el.querySelector('#l').tagName, 'OL');
});

test('patch-elements validates modes and warns on missing targets', async (t) => {
  const { sigmx, render } = app(t);
  await render('<div></div>');
  assert.throws(
    () => handle(sigmx, 'patch-elements', { mode: 'sideways', elements: '<p></p>' }),
    /unknown mode "sideways"/,
  );
  assert.throws(() => handle(sigmx, 'patch-elements', { mode: 'append', elements: '<p></p>' }), /needs a selector/);
  const warned = [];
  const original = console.warn;
  t.after(() => (console.warn = original));
  console.warn = (...a) => warned.push(a.join(' '));
  handle(sigmx, 'patch-elements', { elements: '<p id="missing"></p>' });
  handle(sigmx, 'patch-elements', { selector: '#nope', mode: 'inner', elements: '<p></p>' });
  assert.equal(warned.length, 2);
});

test('patch-elements applies mounted directives inside new markup', async (t) => {
  const { sigmx, $, render } = app(t);
  $.n = 1;
  const el = await render('<div><p id="host"></p></div>');
  handle(sigmx, 'patch-elements', { elements: '<p id="host"><span data-text="$n"></span></p>' });
  await tick();
  assert.equal(el.querySelector('span').textContent, '1');
  $.n = 2;
  assert.equal(el.querySelector('span').textContent, '2');
});

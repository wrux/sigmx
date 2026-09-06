import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../helpers.mjs';

const input = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

test('bind on a text input works both ways and seeds the signal from the element', async (t) => {
  const { $, render } = app(t);
  const el = await render('<input data-bind:name value="seed">');
  assert.equal($.name, 'seed');
  $.name = 'Ada';
  assert.equal(el.value, 'Ada');
  input(el, 'Grace');
  assert.equal($.name, 'Grace');
});

test('bind with a value instead of a key, and dotted paths', async (t) => {
  const { $, render } = app(t);
  $.user = { email: 'a@b' };
  const el = await render('<input data-bind="user.email">');
  assert.equal(el.value, 'a@b');
  input(el, 'c@d');
  assert.equal($.user.email, 'c@d');
});

test('number and range inputs bind numbers', async (t) => {
  const { $, render } = app(t);
  const el = await render('<input type="number" data-bind:qty value="2">');
  assert.equal($.qty, 2);
  input(el, '7');
  assert.equal($.qty, 7);
  input(el, '');
  assert.equal($.qty, '');
});

test('checkboxes: boolean alone, array when the signal is an array, own value when set', async (t) => {
  const { $, render } = app(t);
  $.tags = ['a'];
  const el = await render(
    '<div><input type="checkbox" data-bind:agree><input type="checkbox" data-bind:tags value="a"><input type="checkbox" data-bind:tags value="b"><input type="checkbox" data-bind:plan value="pro"></div>',
  );
  const [agree, a, b, plan] = el.children;
  assert.equal($.agree, false, 'seeded from the element');
  agree.click();
  assert.equal($.agree, true);
  assert.equal(a.checked, true);
  assert.equal(b.checked, false);
  b.click();
  assert.deepEqual([...$.tags].sort(), ['a', 'b']);
  a.click();
  assert.deepEqual([...$.tags], ['b']);
  plan.click();
  assert.equal($.plan, 'pro');
  plan.click();
  assert.equal($.plan, '');
});

test('radios bind the checked value and share a name', async (t) => {
  const { $, render } = app(t);
  $.size = 'm';
  const el = await render(
    '<div><input type="radio" data-bind:size value="s"><input type="radio" data-bind:size value="m"></div>',
  );
  const [s, m] = el.children;
  assert.equal(m.checked, true);
  assert.equal(s.name, 'size');
  s.click();
  assert.equal($.size, 's');
});

test('select single and multiple', async (t) => {
  const { $, render } = app(t);
  $.one = 'b';
  $.many = ['x'];
  const el = await render(
    '<div><select data-bind:one><option>a</option><option>b</option></select><select multiple data-bind:many><option>x</option><option>y</option></select></div>',
  );
  const [single, multi] = el.children;
  assert.equal(single.value, 'b');
  single.value = 'a';
  single.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal($.one, 'a');
  assert.equal(multi.options[0].selected, true);
  multi.options[1].selected = true;
  multi.dispatchEvent(new Event('change', { bubbles: true }));
  assert.deepEqual([...$.many], ['x', 'y']);
  $.many = ['y'];
  assert.equal(multi.options[0].selected, false);
});

test('textarea, __event and __prop adapters', async (t) => {
  const { $, render } = app(t);
  $.note = 'n';
  $.hide = true;
  const el = await render(
    '<div><textarea data-bind:note></textarea><input data-bind:late__event.change><p data-bind:hide__prop.hidden></p></div>',
  );
  const [ta, late, p] = el.children;
  assert.equal(ta.value, 'n');
  input(ta, 'changed');
  assert.equal($.note, 'changed');
  input(late, 'typing');
  assert.equal($.late, undefined, 'input events ignored when __event.change is set');
  late.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal($.late, 'typing');
  assert.equal(p.hidden, true);
  $.hide = false;
  assert.equal(p.hidden, false);
});

test('bind resyncs when the morph changes a default value', async (t) => {
  const { $, render } = app(t);
  const el = await render('<input data-bind:v value="one">');
  el.value = 'server';
  el.dispatchEvent(new Event('sigmx-prop-change', { bubbles: true }));
  assert.equal($.v, 'server');
});

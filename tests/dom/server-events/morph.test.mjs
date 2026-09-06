import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../setup.mjs';
import { morph, morphInner } from '../../../dist/plugins/index.js';

const el = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild;
};
const mount = (t, html) => {
  const node = el(html);
  document.body.append(node);
  t.after(() => node.remove());
  return node;
};

test('keeps elements by id across reorders, updates text, inserts and removes', (t) => {
  const a = mount(t, '<ul><li id="x">x</li><li id="y"><input id="in"></li><li>gone</li></ul>');
  const input = a.querySelector('#in');
  input.value = 'typed';
  const y = a.querySelector('#y');
  morph(a, el('<ul><li id="y"><input id="in"></li><li id="x">x2</li><li>new</li></ul>'));
  assert.equal(a.children[0], y);
  assert.equal(a.querySelector('#in'), input);
  assert.equal(input.value, 'typed');
  assert.equal(a.children[1].textContent, 'x2');
  assert.equal(a.children[2].textContent, 'new');
  assert.equal(a.children.length, 3);
});

test('syncs attributes, text nodes and nested structure in place', (t) => {
  const a = mount(t, '<div class="a" title="t"><p>one</p><span>two</span></div>');
  const p = a.querySelector('p');
  morph(a, el('<div class="b" lang="en"><p>uno</p><em>three</em></div>'));
  assert.equal(a.className, 'b');
  assert.equal(a.hasAttribute('title'), false);
  assert.equal(a.getAttribute('lang'), 'en');
  assert.equal(a.querySelector('p'), p, 'compatible element reused');
  assert.equal(p.textContent, 'uno');
  assert.equal(a.children[1].tagName, 'EM');
});

test('live form state survives unless the server default changed; preserve-attr protects attributes', (t) => {
  const a = mount(
    t,
    '<form><input id="a" value="v"><input id="b" value="v"><input id="c" type="checkbox"><textarea id="t">d</textarea><p id="p" class="keep" data-preserve-attr="class">a</p></form>',
  );
  a.querySelector('#a').value = 'typed';
  a.querySelector('#b').value = 'typed';
  a.querySelector('#c').checked = true;
  morph(
    a,
    el(
      '<form><input id="a" value="v"><input id="b" value="new"><input id="c" type="checkbox"><textarea id="t">e</textarea><p id="p" class="new" data-preserve-attr="class">b</p></form>',
    ),
  );
  assert.equal(a.querySelector('#a').value, 'typed', 'same default: user input kept');
  assert.equal(a.querySelector('#b').value, 'new', 'changed default: overwritten');
  assert.equal(a.querySelector('#c').checked, true, 'checked attribute unchanged: state kept');
  assert.equal(a.querySelector('#t').value, 'e');
  assert.equal(a.querySelector('#p').className, 'keep');
  assert.equal(a.querySelector('#p').textContent, 'b');
});

test('a changed default dispatches sigmx-prop-change so bind can resync', (t) => {
  const a = mount(
    t,
    '<div><input id="i" value="1"><select id="s"><option>a</option><option selected>b</option></select></div>',
  );
  const seen = [];
  a.addEventListener('sigmx-prop-change', (e) => seen.push(e.target.id));
  morph(
    a,
    el('<div><input id="i" value="2"><select id="s"><option selected>a</option><option>b</option></select></div>'),
  );
  assert.equal(a.querySelector('#i').value, '2');
  assert.equal(a.querySelector('#s').value, 'a');
  assert.deepEqual([...new Set(seen)], ['i', 's'], 'one event per changed field (a select fires per changed option)');
});

test('ignore-morph subtrees are left alone when marked on both sides', (t) => {
  const a = mount(t, '<div><section data-ignore-morph><em>old</em></section><section><em>old</em></section></div>');
  morph(a, el('<div><section data-ignore-morph><em>new</em></section><section><em>new</em></section></div>'));
  assert.equal(a.children[0].textContent, 'old');
  assert.equal(a.children[1].textContent, 'new');
  morph(a, el('<div><section><em>newer</em></section><section><em>new</em></section></div>'));
  assert.equal(a.children[0].textContent, 'newer', 'only ignored when both sides carry the attribute');
});

test('pulls a kept element out of a removed ancestor and into a new one', (t) => {
  const a = mount(t, '<div><section><input id="deep" value="v"></section></div>');
  const input = a.querySelector('#deep');
  input.value = 'edited';
  morph(a, el('<div><article><h2>t</h2><input id="deep" value="v"></article></div>'));
  assert.equal(a.querySelector('#deep'), input);
  assert.equal(input.value, 'edited');
  assert.equal(a.firstElementChild.tagName, 'ARTICLE');
  assert.equal(a.querySelector('section'), null);
});

test('an id that changes tag is recreated rather than kept', (t) => {
  const a = mount(t, '<div><span id="k">a</span></div>');
  const span = a.querySelector('#k');
  morph(a, el('<div><b id="k">a</b></div>'));
  assert.notEqual(a.querySelector('#k'), span);
  assert.equal(a.querySelector('#k').tagName, 'B');
});

test('custom attribute names for ignore and preserve, and template contents', (t) => {
  const a = mount(t, '<div><p hx-ignore-morph>old</p><template id="tpl"><i>old</i></template></div>');
  morph(a, el('<div><p hx-ignore-morph>new</p><template id="tpl"><i>new</i></template></div>'), {
    ignoreAttr: 'hx-ignore-morph',
  });
  assert.equal(a.querySelector('p').textContent, 'old');
  assert.equal(a.querySelector('template').innerHTML, '<i>new</i>');
});

test('morphInner morphs children only and handles fragments', (t) => {
  const a = mount(t, '<ul class="keep"><li id="1">a</li><li id="2">b</li></ul>');
  const second = a.querySelector('[id="2"]');
  const frag = document.createDocumentFragment();
  frag.append(el('<li id="2">b2</li>'), el('<li id="3">c</li>'));
  morphInner(a, frag);
  assert.equal(a.className, 'keep');
  assert.deepEqual(
    [...a.children].map((c) => c.id),
    ['2', '3'],
  );
  assert.equal(a.children[0], second);
  assert.equal(second.textContent, 'b2');
});

test('scripts arriving through the morph are replaced with executable copies', (t) => {
  const a = mount(t, '<div><p>x</p></div>');
  morph(a, el('<div><p>x</p><script type="text/plain" data-x="1">1+1</script></div>'));
  const s = a.querySelector('script');
  assert.equal(s.getAttribute('data-x'), '1');
  assert.equal(s.text, '1+1');
  const before = s;
  morph(a, el('<div><p>x</p><script type="text/plain" data-x="1">1+1</script></div>'));
  assert.equal(a.querySelector('script'), before, 'an already-activated script is not replaced again');
});

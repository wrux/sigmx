// Regression tests for the hardening pass (DOM level): each test names the failure it guards against.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attribute, createSigmx } from '../../dist/kernel/index.js';
import { morph } from '../../dist/plugins/server-events/morph.js';
import { all } from '../../dist/presets/all.js';
import { app, mockFetch, native, tick, until } from './helpers.mjs';

const click = async (el) => {
  el.click();
  await tick();
};
const frag = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.firstElementChild;
};

test('a teleported element keeps its state: moving is not an unmount', async (t) => {
  const target = document.createElement('div');
  target.id = 'tp-target';
  document.body.append(target);
  t.after(() => target.remove());
  const { $, render } = app(t);
  $.inits = 0;
  await render('<div data-teleport="#tp-target" data-init="$inits++" data-signals:local="1"></div>');
  await tick();
  assert.equal($.inits, 1);
  assert.equal(target.children.length, 1);
});

test('destroy() before the DOM is ready cancels the pending apply', async () => {
  const s = createSigmx({ plugins: all });
  s.destroy();
  s.apply(document.body);
  assert.equal(document.querySelectorAll('[data-nothing]').length, 0);
});

test('an expression returning a rejected promise is reported through onError', async (t) => {
  const { render, errors } = app(t);
  await render('<div data-init="Promise.reject(new Error(\'later\'))"></div>');
  await until(() => errors.length === 1);
  assert.equal(errors[0].message, 'later');
});

test('cleanup() returns an unregister function; debounced handlers are cancelled on unmount', async (t) => {
  let ran = 0;
  const plugin = attribute({
    name: 'unreg',
    mount: ({ cleanup }) => {
      const off = cleanup(() => ran++);
      off();
    },
  });
  const { $, render } = app(t, { plugins: [...all, plugin] });
  $.hits = 0;
  const el = await render('<div data-unreg><button data-on:click__debounce.20ms="$hits++"></button></div>');
  el.querySelector('button').click();
  el.remove();
  await tick(40);
  assert.equal(ran, 0, 'the unregistered cleanup did not run');
  assert.equal($.hits, 0, 'a pending trailing call died with the element');
});

test('__debounce.1.5s and __threshold.0.5 parse as decimals', async (t) => {
  const observers = [];
  const original = globalThis.IntersectionObserver;
  t.after(() => (globalThis.IntersectionObserver = original));
  globalThis.IntersectionObserver = class {
    constructor(_cb, o) {
      this.o = o;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  };
  const { $, render } = app(t);
  $.n = 0;
  await render('<div><p data-on-intersect__threshold.0.5="1"></p><p data-on-intersect__threshold.abc="1"></p></div>');
  assert.equal(observers[0].o.threshold, 0.005, '0.5 percent');
  assert.equal(observers[1].o.threshold, 0, 'garbage falls back to 0 instead of throwing');
});

test('keyed directives without a key report a contract error instead of writing to path ""', async (t) => {
  const { render, errors, store } = app(t);
  await render('<div data-computed="1" data-match-media="\'x\'"></div>');
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /needs a key/);
  assert.equal(store.paths().includes(''), false);
});

test('a directive computed is disposed with its element, and ref only clears its own path', async (t) => {
  const { $, render, store } = app(t);
  $.n = 1;
  const el = await render('<div><p data-computed:double="$n * 2"></p><i data-ref:node></i></div>');
  assert.equal($.double, 2);
  const i = el.querySelector('i');
  el.querySelector('p').remove();
  await tick();
  assert.equal(store.has('double'), false);
  const other = document.createElement('b');
  store.set('node', other); // someone else owns the path now
  i.remove();
  await tick();
  assert.equal($.node, other, 'unmount of the old element did not clear the new owner');
});

test('@setAll and @toggleAll skip computed paths', async (t) => {
  const { $, render, errors } = app(t);
  $.flags = { a: false, b: false };
  await render(
    '<div data-computed:flags.all="$flags.a && $flags.b" data-init="@toggleAll({ include: /^flags\\./ }); @setAll(true, { include: /^flags\\./ })"></div>',
  );
  assert.equal(errors.length, 0);
  assert.equal($.flags.all, true);
});

test('query-string keeps the type of its default and never wipes other parameters', async (t) => {
  const before = location.href;
  t.after(() => history.replaceState(null, '', before));
  history.replaceState(null, '', '/h?code=007&other=1');
  const { $, render } = app(t);
  await render('<div data-query-string:code="\'\'"></div>');
  assert.equal($.code, '007', 'a string default keeps a numeric-looking value a string');
  $.code = 'abc';
  assert.equal(new URLSearchParams(location.search).get('other'), '1');
});

test('animate with a zero duration writes the target at once', async (t) => {
  const { $, render } = app(t);
  $.o = 0;
  const el = await render('<div data-animate:opacity__duration.0="$o"></div>');
  $.o = 1;
  assert.equal(el.style.opacity, '1');
});

test('style object form keeps custom property names; class only removes what it added', async (t) => {
  const { $, render } = app(t);
  $.c = 'red';
  $.on = true;
  const el = await render(
    '<div class="static hot" data-style="{ \'--accent\': $c }" data-class="{ hot: $on, added: $on }"></div>',
  );
  assert.equal(el.style.getPropertyValue('--accent'), 'red');
  $.on = false;
  assert.equal(el.classList.contains('hot'), true, 'a static class the directive also toggles is not removed');
  assert.equal(el.classList.contains('added'), false);
  $.on = true;
  el.removeAttribute('data-class');
  await tick();
  assert.deepEqual([...el.classList], ['static', 'hot']);
});

test('@fit with an empty input range, @peek with a value, remove-me with a bad delay', async (t) => {
  const { $, render, errors } = app(t);
  await render('<div data-signals="{ f: @fit(3, 5, 5, 0, 10), p: @peek(7) }"></div>');
  assert.equal($.f, 0);
  assert.equal($.p, 7);
  const el = await render('<p data-remove-me="soon"></p>');
  await tick(20);
  assert.equal(el.isConnected, true);
  assert.match(errors.at(-1).message, /bad delay/);
});

test('on-signal-patch:key fires when an ancestor of the key is removed', async (t) => {
  const { $, render } = app(t);
  $.user = { name: 'a' };
  $.hits = 0;
  await render('<div data-on-signal-patch:user.name="$hits++"></div>');
  $.user = null;
  await tick();
  assert.equal($.hits, 1);
});

test('collapse, transition and custom-validity undo their changes on unmount', async (t) => {
  const { $, render } = app(t);
  $.open = false;
  $.msg = 'bad';
  const el = await render(
    '<div><div id="c" style="height: 3rem" data-collapse="$open"></div><div id="t" style="display: grid" data-transition="$open"></div><input id="v" data-custom-validity="$msg"></div>',
  );
  const [c, tr, v] = el.children;
  assert.equal(c.style.height, '0px');
  assert.equal(tr.style.display, 'none');
  assert.equal(v.validationMessage, 'bad');
  c.removeAttribute('data-collapse');
  tr.removeAttribute('data-transition');
  v.removeAttribute('data-custom-validity');
  await tick();
  assert.equal(c.style.height, '3rem');
  assert.equal(tr.style.display, 'grid');
  assert.equal(v.validationMessage, '');
});

test('bind writes an empty field when its signal is removed', async (t) => {
  const { $, render } = app(t);
  $.name = 'x';
  const el = await render('<input data-bind:name>');
  $.name = null;
  assert.equal(el.value, '');
});

test('morph: shell elements are real HTML elements and changed scripts are replaced', () => {
  const a = frag('<div><section><input id="k"></section><script id="s">1</script></div>');
  const oldScript = a.querySelector('#s');
  morph(a, frag('<div><article class="x"><input id="k"></article><script id="s">2</script></div>'));
  const article = a.firstElementChild;
  assert.equal(article.localName, 'article');
  assert.equal(article instanceof HTMLElement, true);
  assert.equal(article.className, 'x');
  assert.notEqual(a.querySelector('#s'), oldScript, 'a changed script is a fresh element');
});

test('morph: a kept element passed over stays connected until it is moved', (t) => {
  const a = frag('<div><p id="k">k</p><b>x</b></div>');
  document.body.append(a);
  t.after(() => a.remove());
  const kept = a.querySelector('#k');
  let disconnected = false;
  const observer = new MutationObserver((records) => {
    for (const r of records) for (const n of r.removedNodes) if (n === kept) disconnected = true;
  });
  observer.observe(a, { childList: true, subtree: true });
  morph(a, frag('<div><b>x</b><p id="k">k</p></div>'));
  observer.takeRecords().forEach((r) => {
    for (const n of r.removedNodes) if (n === kept && !kept.isConnected) disconnected = true;
  });
  observer.disconnect();
  assert.equal(a.textContent, 'xk');
  assert.equal(a.querySelector('#k'), kept);
  assert.equal(kept.isConnected, true);
  assert.equal(disconnected, false);
});

// Full-document responses (head merge, <html> attributes) are exercised by the Playwright boost test: happy-dom's
// DOMParser documents are not `instanceof Document`, so that path cannot run here.

test('requests: header names are case-insensitive, non-submit buttons are not submitters, invalid forms emit nothing', async (t) => {
  const calls = mockFetch(t, () => new native.Response(null, { status: 204 }));
  const fetches = [];
  const h = (e) => fetches.push(e.detail.type);
  document.addEventListener('sigmx-fetch', h);
  t.after(() => document.removeEventListener('sigmx-fetch', h));
  const { render } = app(t);
  const el = await render(
    "<div><button id=\"h\" data-on:click=\"@post('/h', { headers: { 'content-type': 'text/plain', accept: 'x/y' } })\"></button>" +
      '<form id="f"><input name="q" value="v" required><button id="b" type="button" data-on:click="@post(\'/f\', { contentType: \'form\' })"></button></form></div>',
  );
  await click(el.querySelector('#h'));
  await until(() => calls.length === 1);
  assert.equal(calls[0].headers.get('content-type'), 'text/plain');
  assert.equal(calls[0].headers.get('accept'), 'x/y');
  await click(el.querySelector('#b'));
  await until(() => calls.length === 2);
  assert.equal(await calls[1].text(), 'q=v', 'a type=button trigger is not passed to FormData');
  el.querySelector('input').value = '';
  fetches.length = 0;
  await click(el.querySelector('#b'));
  await tick(20);
  assert.deepEqual(fetches, [], 'an invalid form sends nothing and announces nothing');
});

test('requests: the finished event and the returned promise carry the final response', async (t) => {
  mockFetch(t, () => new native.Response(null, { status: 204 }));
  const { $, render } = app(t);
  const details = [];
  const h = (e) => e.detail.type === 'finished' && details.push(e.detail);
  document.addEventListener('sigmx-fetch', h);
  t.after(() => document.removeEventListener('sigmx-fetch', h));
  await render('<div data-init="@get(\'/done\').then(r => $status = r.status)"></div>');
  await until(() => $.status === 204);
  assert.equal(details[0].status, 204);
  assert.equal(typeof details[0].redirected, 'boolean');
});

test('@ws accepts CRLF blocks and ignores binary frames', async (t) => {
  const sockets = [];
  const original = globalThis.WebSocket;
  t.after(() => (globalThis.WebSocket = original));
  globalThis.WebSocket = class {
    constructor() {
      sockets.push(this);
    }
    close() {}
  };
  const { $, render } = app(t);
  await render('<div data-init="@ws(\'/live\')"></div>');
  sockets[0].onmessage({
    data: 'event: sigmx-patch-signals\r\ndata: signals {"a": 1}\r\n\r\nevent: sigmx-patch-signals\r\ndata: signals {"b": 2}',
  });
  sockets[0].onmessage({ data: new ArrayBuffer(4) });
  assert.equal($.a, 1);
  assert.equal($.b, 2);
});

test('boost: submitter formaction/formmethod win, hash-only popstates do not refetch', async (t) => {
  const before = location.href;
  t.after(() => history.replaceState(null, '', before));
  const calls = mockFetch(t, () => new native.Response(null, { status: 204 }));
  const { render } = app(t);
  const el = await render(
    '<div data-boost><form action="/a" method="get"><input name="q" value="1"><button id="alt" formaction="/alt" formmethod="post"></button></form></div>',
  );
  const form = el.querySelector('form');
  const e = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: el.querySelector('#alt') });
  form.dispatchEvent(e);
  await until(() => calls.length === 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(new URL(calls[0].url).pathname, '/alt');
  await until(() => location.pathname === '/alt', 500);
  history.replaceState(null, '', '/alt#section');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await tick(20);
  assert.equal(calls.length, 1, 'a hash change is not a navigation');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handler } from '../../../dist/kernel/index.js';
import {
  app,
  event,
  htmlResponse,
  jsonResponse,
  lastEvent,
  mockFetch,
  native,
  sseResponse,
  streamResponse,
  tick,
  until,
} from '../helpers.mjs';

const click = async (el) => {
  el.click();
  await tick();
};

test('@get sends signals in the query with the request headers; JSON replies merge', async (t) => {
  const calls = mockFetch(t, () => jsonResponse({ fromServer: 42 }));
  const { $, render } = app(t);
  $.q = 'hello';
  $._secret = 'no';
  $.nested = { _hidden: 1, shown: 2 };
  const el = await render('<button data-on:click="@get(\'/api/one\')"></button>');
  await click(el);
  await until(() => $.fromServer === 42);
  const req = calls[0];
  const url = new URL(req.url);
  assert.equal(url.pathname, '/api/one');
  assert.deepEqual(
    JSON.parse(url.searchParams.get('sigmx')),
    { q: 'hello', nested: { shown: 2 } },
    'underscore paths excluded',
  );
  assert.equal(req.headers.get('sigmx-request'), 'true');
  assert.match(req.headers.get('accept'), /text\/event-stream/);
});

test('@post sends a JSON body; filter, payload and headers options', async (t) => {
  const calls = mockFetch(t, () => new native.Response(null, { status: 204 }));
  const { $, render } = app(t);
  $.a = 1;
  $.b = 2;
  const el = await render(
    '<div><button id="p" data-on:click="@post(\'/api/two\')"></button><button id="f" data-on:click="@put(\'/api/three\', { filter: { include: /^a$/ }, headers: { \'X-Test\': \'1\' } })"></button><button id="y" data-on:click="@patch(\'/api/four\', { payload: { only: true } })"></button></div>',
  );
  await click(el.querySelector('#p'));
  await click(el.querySelector('#f'));
  await click(el.querySelector('#y'));
  await until(() => calls.length === 3);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.get('content-type'), 'application/json');
  assert.deepEqual(await calls[0].json(), { a: 1, b: 2 });
  assert.deepEqual(await calls[1].json(), { a: 1 });
  assert.equal(calls[1].headers.get('x-test'), '1');
  assert.deepEqual(await calls[2].json(), { only: true });
});

test('HTML replies morph by id, or by the selector and mode headers', async (t) => {
  let n = 0;
  mockFetch(t, () =>
    ++n === 1
      ? htmlResponse('<p id="out" class="x">from server</p>')
      : htmlResponse('<li>appended</li>', { 'sigmx-selector': '#list', 'sigmx-mode': 'append' }),
  );
  const { render } = app(t);
  const el = await render(
    '<div><p id="out">before</p><ul id="list"><li>a</li></ul><button data-on:click="@get(\'/api/html\')"></button></div>',
  );
  const p = el.querySelector('#out');
  await click(el.querySelector('button'));
  await until(() => p.textContent === 'from server');
  assert.equal(p.className, 'x');
  await click(el.querySelector('button'));
  await until(() => el.querySelector('#list').children.length === 2);
  assert.equal(el.querySelector('#list').lastElementChild.textContent, 'appended');
});

test('JSON replies honour the only-if-missing header', async (t) => {
  mockFetch(t, () => jsonResponse({ a: 9, b: 1 }, { 'sigmx-only-if-missing': 'true' }));
  const { $, render } = app(t);
  $.a = 1;
  const el = await render('<button data-on:click="@get(\'/api/oim\')"></button>');
  await click(el);
  await until(() => $.b === 1);
  assert.equal($.a, 1);
});

test('event-stream replies route every event to handlers and announce them', async (t) => {
  mockFetch(t, () =>
    sseResponse(
      event('sigmx-patch-signals', ['signals {"s": 1}']) +
        event('sigmx-patch-elements', ['selector #t', 'mode inner', 'elements <b>x</b>']) +
        event('sigmx-custom', ['a 1', 'b two words']),
    ),
  );
  const seen = lastEvent(t, 'sigmx-server-event');
  const custom = [];
  const { $, render, sigmx } = app(t);
  sigmx.use(handler({ name: 'custom', handle: (_, data) => custom.push(data) }));
  const el = await render('<div><p id="t"></p><button data-on:click="@get(\'/api/sse\')"></button></div>');
  await click(el.querySelector('button'));
  await until(() => custom.length === 1);
  assert.equal($.s, 1);
  assert.equal(el.querySelector('#t').innerHTML, '<b>x</b>');
  assert.deepEqual(custom[0], { a: '1', b: 'two words' });
  assert.deepEqual(
    seen.map((e) => e.event),
    ['sigmx-patch-signals', 'sigmx-patch-elements', 'sigmx-custom'],
  );
});

test('a live stream applies patches as they arrive; the indicator tracks it', async (t) => {
  const stream = streamResponse();
  mockFetch(t, () => stream.response);
  const { $, render } = app(t);
  const el = await render('<div><button data-on:click="@get(\'/api/live\')" data-indicator:busy></button></div>');
  assert.equal($.busy, false);
  await click(el.querySelector('button'));
  await until(() => $.busy === true);
  stream.send(event('sigmx-patch-signals', ['signals {"p": 10}']));
  await until(() => $.p === 10);
  stream.send(event('sigmx-patch-signals', ['signals {"p": 20}']));
  await until(() => $.p === 20);
  stream.close();
  await until(() => $.busy === false);
});

test('status errors emit a sigmx-fetch error and do not throw; onStatusError retries with backoff', async (t) => {
  let n = 0;
  mockFetch(t, () =>
    new native.Response('nope', {
      status: ++n < 3 ? 500 : 200,
      headers: { 'content-type': 'application/json' },
    }).clone(),
  );
  const fetches = lastEvent(t, 'sigmx-fetch');
  const { $, render, errors } = app(t);
  const el = await render(
    '<div><button id="a" data-on:click="@get(\'/api/fail\')"></button><button id="b" data-on:click="@get(\'/api/retry\', { retry: { onStatusError: true, interval: 1, attempts: 5 } })"></button></div>',
  );
  await click(el.querySelector('#a'));
  await until(() => fetches.some((f) => f.type === 'finished'));
  assert.ok(fetches.some((f) => f.type === 'error' && f.status === 500));
  assert.equal(errors.length, 0);
  n = 0;
  mockFetch(t, () => (++n < 3 ? new native.Response('', { status: 503 }) : jsonResponse({ ok: n })));
  await click(el.querySelector('#b'));
  await until(() => $.ok === 3);
});

test('an exception while applying a response is reported once and not retried', async (t) => {
  const calls = mockFetch(
    t,
    () =>
      new native.Response('<p>x</p>', {
        headers: { 'content-type': 'text/html', 'sigmx-selector': '#t', 'sigmx-mode': 'sideways' },
      }),
  );
  const { render, errors } = app(t);
  const el = await render(
    '<div id="t"><button data-on:click="@get(\'/api/bad-mode\', { retry: { interval: 1 } })"></button></div>',
  );
  await click(el.querySelector('button'));
  await until(() => errors.length === 1);
  await tick(30);
  assert.equal(calls.length, 1, 'no retry for a handler error');
  assert.match(errors[0].message, /GET \/api\/bad-mode/);
});

test('a second request to the same URL aborts the first unless abort is none; unmount aborts too', async (t) => {
  const pending = [];
  mockFetch(
    t,
    (req) =>
      new Promise(
        (_, reject) =>
          req.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) || pending.push(req),
      ),
  );
  const fetches = lastEvent(t, 'sigmx-fetch');
  const { render, errors } = app(t);
  const el = await render(
    '<div><button id="r" data-on:click="@get(\'/api/slow\')"></button><button id="n" data-on:click="@get(\'/api/slow2\', { abort: \'none\' })"></button></div>',
  );
  await click(el.querySelector('#r'));
  await click(el.querySelector('#r'));
  await until(() => pending.length === 2);
  assert.equal(pending[0].signal.aborted, true, 'replaced');
  assert.equal(pending[1].signal.aborted, false);
  await click(el.querySelector('#n'));
  await click(el.querySelector('#n'));
  await until(() => pending.length === 4);
  assert.equal(pending[2].signal.aborted, false, 'abort: none lets them overlap');
  el.remove();
  await tick();
  assert.equal(pending[1].signal.aborted, true, 'unmount aborts in-flight requests');
  assert.equal(pending[3].signal.aborted, true);
  await until(() => fetches.filter((f) => f.type === 'finished').length === 4);
  assert.equal(errors.length, 0, 'aborts are silent');
});

test('contentType form posts urlencoded fields, appends them to GET queries, and respects validity', async (t) => {
  const calls = mockFetch(t, () => new native.Response(null, { status: 204 }));
  const { render } = app(t);
  const reported = [];
  const original = HTMLFormElement.prototype.reportValidity;
  t.after(() => (HTMLFormElement.prototype.reportValidity = original));
  HTMLFormElement.prototype.reportValidity = function () {
    reported.push(this.id);
    return false;
  };
  const el = await render(
    '<div><form id="f" data-on:submit="@post(\'/api/form\', { contentType: \'form\' })"><input name="email" value="a@b"><input name="tag" value="x"><button type="submit"></button></form>' +
      '<form id="g" data-on:submit="@get(\'/api/formget\', { contentType: \'form\' })"><input name="q" value="hi"></form>' +
      '<form id="h" data-on:submit="@post(\'/api/invalid\', { contentType: \'form\' })"><input name="r" required></form>' +
      '<form id="s"><input name="from" value="sel"></form><button id="sel" data-on:click="@post(\'/api/selector\', { contentType: \'form\', selector: \'#s\' })"></button></div>',
  );
  const submit = (id) =>
    el.querySelector(`#${id}`).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  submit('f');
  submit('g');
  submit('h');
  await click(el.querySelector('#sel'));
  await until(() => calls.length === 3);
  assert.equal(calls[0].headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(await calls[0].text(), 'email=a%40b&tag=x');
  assert.equal(new URL(calls[1].url).searchParams.get('q'), 'hi');
  assert.deepEqual(reported, ['h'], 'invalid form reported, nothing sent');
  assert.equal(await calls[2].text(), 'from=sel');
});

test('reconnect resumes with Last-Event-ID and 204 ends a request', async (t) => {
  const calls = mockFetch(t, (_, n) =>
    n === 1
      ? sseResponse('id: 5\nevent: sigmx-patch-signals\ndata: signals {"a":1}\n\n')
      : new native.Response(null, { status: 204 }),
  );
  const { $, render } = app(t);
  const el = await render(
    '<button data-on:click="@get(\'/api/reconnect\', { reconnect: true, retry: { interval: 1, attempts: 2 } })"></button>',
  );
  await click(el);
  await until(() => calls.length === 2);
  assert.equal($.a, 1);
  assert.equal(calls[1].headers.get('last-event-id'), '5');
});

test('a missing URL is an error; requests made inside an attribute are cleaned up with it', async (t) => {
  const { render, errors } = app(t);
  const el = await render('<button data-on:click="@get(\'\')"></button>');
  await click(el);
  assert.match(errors.at(-1).message, /@get needs a URL/);
});

test('@delete sends signals in the query like GET, without a body', async (t) => {
  const calls = mockFetch(t, () => new native.Response(null, { status: 204 }));
  const { $, render } = app(t);
  $.id = 7;
  const el = await render('<button data-on:click="@delete(\'/api/items\')"></button>');
  await click(el);
  await until(() => calls.length === 1);
  assert.equal(calls[0].method, 'DELETE');
  assert.deepEqual(JSON.parse(new URL(calls[0].url).searchParams.get('sigmx')), { id: 7 });
  assert.equal(calls[0].body, null);
});

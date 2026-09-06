import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { executeScript, patchElements, patchSignals, removeSignals, SignalsError, sigmx } from '../dist/index.js';
import { serveClient } from '../dist/node.js';

const app = () => new Hono().use(sigmx());
const sigmxHeaders = { 'sigmx-request': 'true' };

test('signals come from the query on GET and DELETE', async () => {
  const a = app().get('/s', async (c) => c.json(await c.var.sigmx.signals()));
  const res = await a.request(`/s?sigmx=${encodeURIComponent('{"q":"bri","page":2}')}`);
  assert.deepEqual(await res.json(), { q: 'bri', page: 2 });
  const empty = await a.request('/s');
  assert.deepEqual(await empty.json(), {});
});

test('signals come from a JSON body on POST', async () => {
  const a = app().post('/s', async (c) => c.json(await c.var.sigmx.signals()));
  const res = await a.request('/s', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada' }),
  });
  assert.deepEqual(await res.json(), { name: 'Ada' });
});

test('form posts arrive as fields', async () => {
  const a = app().post('/s', async (c) => c.json(await c.var.sigmx.signals()));
  const res = await a.request('/s', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'ada@example.com' }),
  });
  assert.deepEqual(await res.json(), { email: 'ada@example.com' });
});

const schema = {
  '~standard': {
    validate: (v) =>
      typeof v?.q === 'string' ? { value: { q: v.q } } : { issues: [{ message: 'q must be a string', path: ['q'] }] },
  },
};

test('schema failures become a 422 without touching the handler', async () => {
  const a = app().get('/s', async (c) => {
    const { q } = await c.var.sigmx.signals(schema);
    return c.text(q);
  });
  const ok = await a.request(`/s?sigmx=${encodeURIComponent('{"q":"x"}')}`);
  assert.equal(await ok.text(), 'x');
  const bad = await a.request(`/s?sigmx=${encodeURIComponent('{"q":1}')}`);
  assert.equal(bad.status, 422);
  const body = await bad.json();
  assert.match(body.error, /q must be a string/);
  assert.equal(body.issues.length, 1);
  const broken = await a.request('/s?sigmx=not-json');
  assert.equal(broken.status, 400);
});

test('onError customises the failure response', async () => {
  const a = new Hono()
    .use(sigmx({ onError: (e, c) => c.text(`nope: ${e.issues.length}`, 400) }))
    .get('/s', async (c) => c.text(String(await c.var.sigmx.signals(schema))));
  const res = await a.request(`/s?sigmx=${encodeURIComponent('{"q":1}')}`);
  assert.equal(res.status, 400);
  assert.equal(await res.text(), 'nope: 1');
});

test('other errors still reach app.onError', async () => {
  const a = app()
    .get('/boom', () => {
      throw new Error('boom');
    })
    .onError((e, c) => c.text(`handled ${e.message}`, 500));
  const res = await a.request('/boom');
  assert.equal(res.status, 500);
  assert.equal(await res.text(), 'handled boom');
});

test('html adds the targeting headers only when asked', async () => {
  const a = app()
    .get('/plain', (c) => c.var.sigmx.html('<p id="x">hi</p>'))
    .get('/target', (c) => c.var.sigmx.html('<li>row</li>', { selector: '#rows', mode: 'append', status: 201 }));
  const plain = await a.request('/plain');
  assert.match(plain.headers.get('content-type'), /text\/html/);
  assert.equal(plain.headers.get('sigmx-selector'), null);
  assert.equal(await plain.text(), '<p id="x">hi</p>');
  const target = await a.request('/target');
  assert.equal(target.status, 201);
  assert.equal(target.headers.get('sigmx-selector'), '#rows');
  assert.equal(target.headers.get('sigmx-mode'), 'append');
});

test('json merges signals, with an only-if-missing header on request', async () => {
  const a = app().get('/j', (c) => c.var.sigmx.json({ count: 3 }, { onlyIfMissing: true }));
  const res = await a.request('/j');
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal(res.headers.get('sigmx-only-if-missing'), 'true');
  assert.deepEqual(await res.json(), { count: 3 });
});

test('events sends several patches in one response', async () => {
  const a = app().get('/e', (c) =>
    c.var.sigmx.events(patchElements('<ul id="t">\n<li>a</li>\n</ul>'), patchSignals({ stale: false })),
  );
  const res = await a.request('/e');
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(
    await res.text(),
    'event: sigmx-patch-elements\ndata: elements <ul id="t">\ndata: elements <li>a</li>\ndata: elements </ul>\n\n' +
      'event: sigmx-patch-signals\ndata: signals {"stale":false}\n\n',
  );
});

test('stream delivers patches over time and closes when the callback ends', async () => {
  const a = app().get('/p', (c) =>
    c.var.sigmx.stream(async (s) => {
      await s.patchSignals({ progress: 0 });
      await s.sleep(10);
      await s.patchElements('<b id="x">done</b>');
      await s.removeSignals(['tmp.a']);
    }),
  );
  const res = await a.request('/p');
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const text = await res.text();
  assert.equal(
    text,
    'event: sigmx-patch-signals\ndata: signals {"progress":0}\n\n' +
      'event: sigmx-patch-elements\ndata: elements <b id="x">done</b>\n\n' +
      'event: sigmx-patch-signals\ndata: signals {"tmp":{"a":null}}\n\n',
  );
});

test('isRequest reflects the client header', async () => {
  const a = app().get('/r', (c) => c.text(String(c.var.sigmx.isRequest)));
  assert.equal(await (await a.request('/r')).text(), 'false');
  assert.equal(await (await a.request('/r', { headers: sigmxHeaders })).text(), 'true');
});

test('executeScript wraps code in a self-removing script appended to body', () => {
  const e = executeScript('console.log(1)');
  assert.equal(e.lines[0], 'selector body');
  assert.equal(e.lines[1], 'mode append');
  assert.match(e.lines[2], /^elements <script data-init="el\.remove\(\)">console\.log\(1\)<\/script>$/);
  assert.deepEqual(removeSignals(['a', 'b.c']).lines, ['signals {"a":null,"b":{"c":null}}']);
  assert.equal(new SignalsError('x').status, 422);
});

test('serveClient serves the standalone build with an ETag', async () => {
  const a = new Hono().get('/sigmx.js', serveClient({ maxAge: 60 }));
  const res = await a.request('/sigmx.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
  const etag = res.headers.get('etag');
  assert.match(etag, /^"[A-Za-z0-9_-]{16}"$/);
  const body = await res.text();
  assert.ok(body.length > 10_000);
  const again = await a.request('/sigmx.js', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
});

test('markup helpers accept anything that renders to a string, such as html templates and JSX', async () => {
  const name = '<Ada>';
  const fragment = html`<p id="g">Hello ${name}</p>`;
  assert.deepEqual(patchElements(fragment).lines, ['elements <p id="g">Hello &lt;Ada&gt;</p>']);
  const a = app().get('/h', (c) => c.var.sigmx.html(fragment, { selector: '#out', mode: 'inner' }));
  const res = await a.request('/h');
  assert.equal(await res.text(), '<p id="g">Hello &lt;Ada&gt;</p>');
  assert.equal(res.headers.get('sigmx-mode'), 'inner');
});

test('stream stops when the client disconnects', async () => {
  let observedClosed = false;
  let writes = 0;
  const a = app().get('/forever', (c) =>
    c.var.sigmx.stream(async (s) => {
      while (!s.closed) {
        await s.patchSignals({ tick: ++writes });
        await s.sleep(5);
      }
      observedClosed = true;
    }),
  );
  const res = await a.request('/forever');
  const reader = res.body.getReader();
  await reader.read();
  await reader.cancel(); // what a browser does when the user navigates away
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(observedClosed, true);
  assert.ok(writes < 20, `stopped early (${writes} writes)`);
});

test('isRequest lets one route answer a page or a partial', async () => {
  const a = app().get('/page', (c) =>
    c.var.sigmx.isRequest ? c.html('<p id="x">partial</p>') : c.html('<html><body><p id="x">page</p></body></html>'),
  );
  assert.equal(await (await a.request('/page')).text(), '<html><body><p id="x">page</p></body></html>');
  assert.equal(await (await a.request('/page', { headers: sigmxHeaders })).text(), '<p id="x">partial</p>');
});

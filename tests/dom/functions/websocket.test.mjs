import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, lastEvent, tick } from '../helpers.mjs';

const fakeSocket = (t) => {
  const sockets = [];
  const original = globalThis.WebSocket;
  t.after(() => (globalThis.WebSocket = original));
  globalThis.WebSocket = class {
    constructor(url, protocols) {
      this.url = String(url);
      this.protocols = protocols;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }
    send(d) {
      this.sent.push(d);
    }
    close() {
      this.closed = true;
    }
    receive(text) {
      this.onmessage({ data: text });
    }
  };
  return sockets;
};

test('@ws opens a socket, routes incoming blocks as server events, sends JSON and closes on unmount', async (t) => {
  const sockets = fakeSocket(t);
  const seen = lastEvent(t, 'sigmx-server-event');
  const { $, render } = app(t);
  const el = await render(
    "<div data-init=\"$sock = @ws('/live', { protocols: ['v1'] })\"><button data-on:click=\"$sock.send({ hi: 1 }); $sock.send('raw')\"></button></div>",
  );
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'ws://localhost/live');
  assert.deepEqual(sockets[0].protocols, ['v1']);
  sockets[0].receive(
    'event: sigmx-patch-signals\ndata: signals {"a": 1}\n\nevent: sigmx-custom\ndata: k one\ndata: k two',
  );
  assert.equal($.a, 1);
  assert.deepEqual(
    seen.map((e) => [e.event, e.data]),
    [
      ['sigmx-patch-signals', { signals: '{"a": 1}' }],
      ['sigmx-custom', { k: 'one\ntwo' }],
    ],
  );
  el.querySelector('button').click();
  assert.deepEqual(sockets[0].sent, ['{"hi":1}', 'raw']);
  el.remove();
  await tick();
  assert.equal(sockets[0].closed, true);
});

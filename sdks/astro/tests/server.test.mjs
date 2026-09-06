import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootScript } from '../dist/index.js';
import { patchSignals, readSignals, sse } from '../dist/server.js';

test('server helpers are re-exported from sigmx/server', async () => {
  const res = sse(patchSignals({ a: 1 }));
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(await res.text(), 'event: sigmx-patch-signals\ndata: signals {"a":1}\n\n');
  const get = new Request(`http://x/?sigmx=${encodeURIComponent('{"q":"a"}')}`);
  assert.deepEqual(await readSignals(get), { q: 'a' });
});

test('bootScript wires presets, plugin lists and options', () => {
  assert.match(bootScript(), /import \{ all as plugins \} from 'sigmx\/presets\/all'/);
  assert.match(
    bootScript({ plugins: ['text', 'on'], prefix: 'hx-', expose: false }),
    /import \{ text, on \} from 'sigmx\/plugins'/,
  );
  assert.doesNotMatch(bootScript({ expose: false }), /window\[/);
});

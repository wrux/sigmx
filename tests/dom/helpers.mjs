import './setup.mjs';
import { createSigmx } from '../../dist/kernel/index.js';
import { all } from '../../dist/presets/all.js';
import { native } from './setup.mjs';

export { native };

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export const until = async (fn, ms = 2000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await tick(5);
  }
};

/**
 * A sigmx instance observing its own stage element, torn down when the test ends.
 * `errors` collects everything reported through `onError`.
 */
export const app = (t, options = {}) => {
  const stage = document.createElement('div');
  document.body.append(stage);
  const errors = [];
  const sigmx = createSigmx({
    plugins: all,
    autoStart: false,
    onError: (e, info) => errors.push({ message: String(e?.message ?? e), info }),
    ...options,
  });
  sigmx.apply(stage);
  const render = async (html) => {
    stage.innerHTML = html;
    await tick();
    return stage.firstElementChild;
  };
  t.after(() => {
    sigmx.destroy();
    stage.remove();
  });
  return { sigmx, $: sigmx.$, store: sigmx.store, stage, errors, render };
};

/** Replace global fetch for the test; `calls` records every request as a native Request. */
export const mockFetch = (t, handler) => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = new native.Request(url, init);
    calls.push(req);
    const res = await handler(req, calls.length);
    return res instanceof native.Response ? res : new native.Response(res);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
};

export const htmlResponse = (body, headers = {}) =>
  new native.Response(body, { headers: { 'content-type': 'text/html', ...headers } });
export const jsonResponse = (body, headers = {}) =>
  new native.Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });
export const sseResponse = (text, headers = {}) =>
  new native.Response(text, { headers: { 'content-type': 'text/event-stream', ...headers } });

/** An event-stream response fed over time; call `send(text)` and `close()` from the test. */
export const streamResponse = () => {
  let controller;
  const encoder = new TextEncoder();
  const body = new native.ReadableStream({
    start: (c) => {
      controller = c;
    },
  });
  return {
    response: new native.Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    send: (text) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
};

export const event = (name, data) => `event: ${name}\n${data.map((l) => `data: ${l}`).join('\n')}\n\n`;

export const lastEvent = (t, type) => {
  const seen = [];
  const h = (e) => seen.push(e.detail);
  document.addEventListener(type, h);
  t.after(() => document.removeEventListener(type, h));
  return seen;
};

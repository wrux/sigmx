import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, mockFetch, native, tick, until } from '../helpers.mjs';

const restoreUrl = (t) => {
  const before = location.href;
  t.after(() => history.replaceState(null, '', before));
};

// Records boost's decision as the event leaves its container, then stops happy-dom from navigating itself.
const decisions = (stage, type) => {
  let prevented;
  stage.addEventListener(type, (e) => {
    prevented = e.defaultPrevented;
    e.preventDefault();
  });
  return () => prevented;
};

test('boost turns same-origin link clicks into GET requests with a history entry', async (t) => {
  restoreUrl(t);
  const calls = mockFetch(t, () => new native.Response(null, { status: 204 }));
  const { render, stage } = app(t);
  const el = await render(
    '<div data-boost><a id="in" href="/next?x=1">next</a><a id="ext" href="https://example.com/">ext</a><a id="hash" href="#top">top</a><a id="blank" href="/other" target="_blank">blank</a></div>',
  );
  const prevented = decisions(stage, 'click');
  const click = (id, init = {}) => {
    el.querySelector(`#${id}`).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    return prevented();
  };
  assert.equal(click('in'), true);
  await until(() => calls.length === 1);
  assert.equal(new URL(calls[0].url).pathname, '/next');
  assert.equal(calls[0].method, 'GET');
  assert.equal(location.pathname + location.search, '/next?x=1');
  assert.equal(click('ext'), false, 'other origins are left to the browser');
  assert.equal(click('hash'), false, 'same-page anchors are left alone');
  assert.equal(click('blank'), false, 'targets are left alone');
  assert.equal(click('in', { metaKey: true }), false, 'modified clicks open normally');
  await tick();
  assert.equal(calls.length, 1);
});

test('boost submits forms as requests and re-fetches on popstate', async (t) => {
  restoreUrl(t);
  const calls = mockFetch(t, () => new native.Response(null, { status: 204 }));
  const { render, stage } = app(t);
  await render(
    '<div data-boost__replace><form id="f" method="post" action="/save"><input name="q" value="v"></form></div>',
  );
  const prevented = decisions(stage, 'submit');
  document.getElementById('f').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(prevented(), true);
  await until(() => calls.length === 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(await calls[0].text(), 'q=v');
  assert.equal(location.pathname, '/save');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await until(() => calls.length === 2);
  assert.equal(calls[1].method, 'GET');
});

// Feature probes: one small behavioural check per feature, written against the public API so the
// same probe can run against any build of the library (see run.mjs, which runs them against a
// baseline build and the current one). A probe throws when the feature is missing or broken.
//
// `removed: true` records that the current build intentionally no longer has the feature; the
// node:test wrapper (features.test.mjs) asserts that flag, so restoring a feature or losing one
// by accident both show up as a failing test.

import assert from 'node:assert/strict';

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const until = async (fn, ms = 2000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await tick(5);
  }
};

/** A library build loaded from a dist directory: the modules a probe may need. */
export const loadBuild = async (dir) => {
  const at = (p) => import(new URL(`${p}.js`, `file://${dir}/`).href);
  const [kernel, presets, plugins, casing, objects, schedule, sse, morph] = await Promise.all([
    at('kernel/index'),
    at('presets/all'),
    at('plugins/index'),
    at('lib/casing'),
    at('lib/objects'),
    at('lib/schedule'),
    at('lib/sse'),
    at('plugins/server-events/morph'),
  ]);
  return { dir, kernel, all: presets.all, plugins, casing, objects, schedule, sse, morph };
};

/** Per-probe harness: an instance on its own stage, mocks that undo themselves, a teardown. */
export const harness = (build, native) => {
  const cleanups = [];
  const after = (fn) => cleanups.push(fn);
  const stage = document.createElement('div');
  document.body.append(stage);
  after(() => stage.remove());
  const errors = [];
  let sigmx;
  const app = (options = {}) => {
    sigmx = build.kernel.createSigmx({
      plugins: build.all,
      autoStart: false,
      onError: (e, info) => errors.push({ message: String(e?.message ?? e), info }),
      ...options,
    });
    sigmx.apply(stage);
    after(() => sigmx.destroy());
    return { sigmx, $: sigmx.$, store: sigmx.store };
  };
  const render = async (html) => {
    stage.innerHTML = html;
    await tick();
    return stage.firstElementChild;
  };
  const mockFetch = (handler) => {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const req = new native.Request(url, init);
      calls.push({ req, init });
      const res = await handler(req, calls.length, init);
      return res instanceof native.Response ? res : new native.Response(res);
    };
    after(() => (globalThis.fetch = original));
    return calls;
  };
  const events = (type) => {
    const seen = [];
    const h = (e) => seen.push(e.detail);
    document.addEventListener(type, h);
    after(() => document.removeEventListener(type, h));
    return seen;
  };
  const stub = (obj, key, value) => {
    const original = Object.getOwnPropertyDescriptor(obj, key);
    Object.defineProperty(obj, key, { value, configurable: true, writable: true });
    after(() => (original ? Object.defineProperty(obj, key, original) : delete obj[key]));
  };
  const json = (body, headers = {}) =>
    new native.Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });
  const html = (body, headers = {}) =>
    new native.Response(body, { headers: { 'content-type': 'text/html', ...headers } });
  const sse = (text) => new native.Response(text, { headers: { 'content-type': 'text/event-stream' } });
  const dispose = () => {
    for (const fn of cleanups.splice(0).reverse()) fn();
  };
  return { build, stage, errors, app, render, mockFetch, events, stub, json, html, sse, after, dispose, native };
};

const input = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const click = async (el) => {
  el.click();
  await tick();
};
const fakeObserver = (h, name) => {
  const instances = [];
  h.stub(
    globalThis,
    name,
    class {
      constructor(cb, options) {
        this.cb = cb;
        this.options = options;
        this.disconnected = false;
        instances.push(this);
      }
      observe(el) {
        this.el = el;
      }
      disconnect() {
        this.disconnected = true;
      }
      fire(entry) {
        if (!this.disconnected) this.cb([{ target: this.el, ...entry }], this);
      }
    },
  );
  return instances;
};

/** [group, name, removed?, probe] — `removed` is the status on the current build. */
const P = [];
const probe = (group, name, run, removed = false) => P.push({ group, name, run, removed });
const gone = (group, name, run) => probe(group, name, run, true);

// ---------------------------------------------------------------- runtime
probe('runtime', 'text directive renders a signal and blanks null', async (h) => {
  const { $ } = h.app();
  $.n = 1;
  const el = await h.render('<div><b data-text="$n"></b><i data-text="$missing"></i></div>');
  assert.equal(el.querySelector('b').textContent, '1');
  assert.equal(el.querySelector('i').textContent, '');
});
probe('runtime', 'custom attribute prefix', async (h) => {
  const { $ } = h.app({ prefix: 'hx-' });
  $.n = 5;
  const el = await h.render('<span hx-text="$n"></span>');
  assert.equal(el.textContent, '5');
});
probe('runtime', 'several attribute prefixes at once', async (h) => {
  const { $ } = h.app({ prefix: ['data-', 'ds-'] });
  $.n = 7;
  const el = await h.render('<div><span ds-text="$n"></span><i data-text="$n"></i></div>');
  assert.equal(el.textContent, '77');
});
probe('runtime', 'data-ignore skips a subtree', async (h) => {
  const { $ } = h.app();
  $.n = 1;
  const el = await h.render(
    '<div><section data-ignore><span data-text="$n"></span></section><b data-text="$n"></b></div>',
  );
  assert.equal(el.querySelector('span').textContent, '');
  assert.equal(el.querySelector('b').textContent, '1');
});
gone('runtime', 'data-ignore__self skips one element but not its children', async (h) => {
  const { $ } = h.app();
  $.n = 1;
  const el = await h.render('<section data-ignore__self data-text="$n"><b data-text="$n"></b></section>');
  assert.equal(el.querySelector('b')?.textContent, '1', 'child still mounted');
});
gone('runtime', 'plugin key/value contract errors (needs a key, takes no value)', async (h) => {
  h.app();
  await h.render('<div><i data-text:x="1"></i><i data-cloak="x"></i></div>');
  const m = h.errors.map((e) => e.message).join('|');
  assert.match(m, /takes no key/);
  assert.match(m, /takes no value/);
});
probe('runtime', 'one failing expression is reported with plugin and element info', async (h) => {
  const { $ } = h.app();
  $.n = 4;
  const el = await h.render('<div><i data-text="this is not js (("></i><b data-text="$n"></b></div>');
  assert.equal(el.querySelector('b').textContent, '4');
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].info.plugin, 'text');
});
probe('runtime', 'unknown @action is reported', async (h) => {
  h.app();
  await h.render('<div data-init="@nope(1)"></div>');
  assert.match(h.errors.at(-1)?.message ?? '', /unknown action @nope/);
});
probe('runtime', 'changing an attribute remounts it; removing it unmounts', async (h) => {
  const { $ } = h.app();
  $.a = 'A';
  $.b = 'B';
  const el = await h.render('<b data-text="$a"></b>');
  el.setAttribute('data-text', '$b');
  await tick();
  assert.equal(el.textContent, 'B');
  el.removeAttribute('data-text');
  await tick();
  $.b = 'C';
  assert.equal(el.textContent, 'B');
});
probe('runtime', 'use() registers plugins late and applies them to observed roots', async (h) => {
  const { sigmx } = h.app();
  const el = await h.render('<div data-late></div>');
  sigmx.use(h.build.kernel.attribute({ name: 'late', mount: ({ el }) => el.setAttribute('done', '') }));
  await tick();
  assert.equal(el.hasAttribute('done'), true);
});
probe('runtime', 'destroy() unmounts everything and stops observing', async (h) => {
  const { $, sigmx } = h.app();
  $.n = 1;
  const el = await h.render('<b data-text="$n"></b>');
  sigmx.destroy();
  $.n = 2;
  assert.equal(el.textContent, '1');
});
gone('runtime', 'sigmx-ready event on the first document apply', async (h) => {
  const seen = h.events('sigmx-ready');
  const { sigmx } = h.app();
  sigmx.apply(document.documentElement);
  assert.equal(seen.length, 1);
});
probe('runtime', 'sigmx-signal-patch event on every settled change', async (h) => {
  const seen = h.events('sigmx-signal-patch');
  const { $ } = h.app();
  $.user = { name: 'Ada' };
  await tick();
  assert.deepEqual(seen.at(-1), { user: { name: 'Ada' } });
});
probe('runtime', 'legacy event prefixes route server events', async (h) => {
  const { sigmx, $ } = h.app({ eventPrefix: ['sigmx-', 'legacy-'] });
  sigmx.runtime.handle('legacy-patch-signals', { signals: '{"a":1}' });
  assert.equal($.a, 1);
});
probe('runtime', 'shadow roots can be applied', async (h) => {
  const { $, sigmx } = h.app();
  $.n = 3;
  const host = await h.render('<div></div>');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<b data-text="$n"></b>';
  sigmx.apply(root);
  assert.equal(root.querySelector('b').textContent, '3');
});
probe('runtime', 'a shared store lets two instances see the same signals', async (h) => {
  const store = h.build.kernel.createStore();
  const a = h.build.kernel.createSigmx({ plugins: h.build.all, autoStart: false, store });
  const b = h.build.kernel.createSigmx({ plugins: h.build.all, autoStart: false, store });
  h.after(() => {
    a.destroy();
    b.destroy();
  });
  a.$.n = 9;
  assert.equal(b.$.n, 9);
});

// ---------------------------------------------------------------- expressions
probe('expressions', '@action( is rewritten outside strings', async (h) => {
  const { $ } = h.app();
  await h.render('<div data-signals="{ v: @fit(5, 0, 10, 0, 100), s: \'@nope(\' }"></div>');
  assert.equal($.v, 50);
  assert.equal($.s, '@nope(');
});
gone('expressions', 'several statements: the last one is the value', async (h) => {
  const { $ } = h.app();
  $.n = 2;
  const el = await h.render('<b data-text="$n = 5; $n + 1"></b>');
  assert.equal(el.textContent, '6');
});
probe('expressions', 'statements run for their effects', async (h) => {
  const { $ } = h.app();
  $.n = 2;
  await h.render('<div data-init="$n = 5; $m = $n + 1"></div>');
  assert.equal($.m, 6);
});
probe('expressions', 'compiled expressions are cached by source', async (h) => {
  const { compile, functionCompiler } = h.build.kernel;
  const s = h.build.kernel.createStore();
  assert.equal(
    compile(functionCompiler, '$x', ['el', 'evt'], true),
    compile(functionCompiler, '$x', ['el', 'evt'], true),
  );
  s.set('x', 1);
});
probe('expressions', '__case.kebab keeps a key kebab-cased', async (h) => {
  const { $ } = h.app();
  await h.render('<input data-bind:first-name__case.kebab value="x">');
  assert.equal($['first-name'], 'x');
});
gone('expressions', '__case.snake / __case.pascal recasing', async (h) => {
  const { $ } = h.app();
  await h.render('<input data-bind:first-name__case.snake value="x">');
  assert.equal($.first_name, 'x');
});

// ---------------------------------------------------------------- timing modifiers
probe('timing', '__debounce waits for a quiet period', async (h) => {
  const { $ } = h.app();
  $.d = 0;
  const el = await h.render('<button data-on:click__debounce.20ms="$d++"></button>');
  el.click();
  el.click();
  assert.equal($.d, 0);
  await until(() => $.d === 1);
});
probe('timing', '__throttle limits to one call per window', async (h) => {
  const { $ } = h.app();
  $.t = 0;
  const el = await h.render('<button data-on:click__throttle.50ms="$t++"></button>');
  el.click();
  el.click();
  assert.equal($.t, 1);
});
gone('timing', '__delay modifier defers the handler', async (h) => {
  const { $ } = h.app();
  await h.render('<div data-init__delay.10ms="$late = true"></div>');
  assert.equal($.late, undefined, 'not run synchronously');
  await until(() => $.late === true, 500);
});
gone('timing', '__viewtransition wraps the handler in document.startViewTransition', async (h) => {
  let called = 0;
  h.stub(document, 'startViewTransition', (fn) => {
    called++;
    fn();
  });
  h.app();
  await h.render('<div data-init__viewtransition="1"></div>');
  assert.equal(called, 1);
});

// ---------------------------------------------------------------- store
probe('store', 'nested paths, merge-patch semantics, null removes', async (h) => {
  const s = h.build.kernel.createStore();
  s.set('user', { name: 'a', tags: ['x'] });
  s.merge({ user: { name: 'b', age: 3 } });
  assert.deepEqual(s.snapshot(), { user: { name: 'b', tags: ['x'], age: 3 } });
  s.merge({ user: { age: null } });
  assert.equal(s.has('user.age'), false);
});
probe('store', 'arrays notify on push', async (h) => {
  const s = h.build.kernel.createStore();
  s.set('items', [1]);
  const seen = [];
  h.build.kernel.effect(() => seen.push(s.get('items').length));
  s.get('items').push(2);
  assert.equal(seen[0], 1);
  assert.equal(seen.at(-1), 2);
});
gone('store', 'arrays notify on delete arr[i]', async (h) => {
  const s = h.build.kernel.createStore();
  s.set('items', [1, 2]);
  const seen = [];
  h.build.kernel.effect(() => seen.push(String(s.get('items')[0])));
  delete s.get('items')[0];
  assert.deepEqual(seen, ['1', 'undefined']);
});
probe('store', 'computed signals live in the store and reject writes', async (h) => {
  const s = h.build.kernel.createStore();
  s.set('n', 2);
  s.define(
    'double',
    h.build.kernel.computed(() => s.get('n') * 2),
  );
  assert.equal(s.get('double'), 4);
  assert.throws(() => s.set('double', 1));
  s.merge({ double: 9 });
  assert.equal(s.get('double'), 4, 'merge skips computed leaves');
});
gone('store', 'empty namespaces appear as {} in snapshots', async (h) => {
  const s = h.build.kernel.createStore();
  s.merge({ ns: {} });
  assert.deepEqual(s.snapshot(), { ns: {} });
});
probe('store', 'snapshot filters and the computed:false option', async (h) => {
  const s = h.build.kernel.createStore();
  s.set('a', 1);
  s.set('_p', 2);
  s.define(
    'c',
    h.build.kernel.computed(() => 3),
  );
  assert.deepEqual(s.snapshot({ exclude: /^_/ }, { computed: false }), { a: 1 });
});
gone('store', 'string-form include/exclude filters', async (h) => {
  const ok = h.build.objects.toPredicate({ exclude: '/^_/' });
  assert.equal(ok('_private'), false);
  assert.equal(ok('public'), true);
});
probe('store', 'onPatch batches nested changes, removals are null', async (h) => {
  const s = h.build.kernel.createStore();
  const patches = [];
  s.onPatch((p) => patches.push(p));
  s.merge({ a: { b: 1 }, c: 2 });
  s.remove('c');
  assert.deepEqual(patches, [{ a: { b: 1 }, c: 2 }, { c: null }]);
});
probe('store', 'JSON.stringify($) and Object.keys($) work through the proxy', async (h) => {
  const { $ } = h.app();
  $.a = 1;
  $.u = { n: 2 };
  assert.equal(JSON.stringify($), '{"a":1,"u":{"n":2}}');
  assert.deepEqual(Object.keys($).sort(), ['a', 'u']);
});
probe('reactive', 'computed is lazy and does not cascade when unchanged', async (h) => {
  const { signal, computed, effect } = h.build.kernel;
  const n = signal(1);
  const even = computed(() => n.value % 2 === 0);
  let runs = 0;
  effect(() => {
    even.value;
    runs++;
  });
  n.value = 3;
  assert.equal(runs, 1);
  n.value = 4;
  assert.equal(runs, 2);
});
gone('reactive', 'Computed.peek() refreshes before reading', async (h) => {
  const { signal, computed } = h.build.kernel;
  const n = signal(1);
  const c = computed(() => n.value * 2);
  assert.equal(c.peek(), 2);
});
probe('reactive', 'batch coalesces and untracked does not subscribe', async (h) => {
  const { signal, effect, batch, untracked } = h.build.kernel;
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  effect(() => {
    a.value;
    untracked(() => b.value);
    runs++;
  });
  batch(() => {
    a.value = 1;
    a.value = 2;
  });
  b.value = 5;
  assert.equal(runs, 2);
});

// ---------------------------------------------------------------- morph
const el = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild;
};
probe('morph', 'keeps elements by id across reorders', async (h) => {
  const a = await h.render('<ul><li id="x">x</li><li id="y">y</li></ul>');
  const x = a.querySelector('#x');
  h.build.morph.morph(a, el('<ul><li id="y">y2</li><li id="x">x</li></ul>'));
  assert.equal(a.querySelector('#x'), x);
  assert.equal(a.textContent, 'y2x');
});
probe('morph', 'pulls a kept element out of a removed ancestor', async (h) => {
  const a = await h.render('<div><section><input id="deep" value="v"></section></div>');
  const inp = a.querySelector('#deep');
  inp.value = 'edited';
  h.build.morph.morph(a, el('<div><article><input id="deep" value="v"></article></div>'));
  assert.equal(a.querySelector('#deep'), inp);
  assert.equal(inp.value, 'edited');
});
probe('morph', 'typed input values survive a morph', async (h) => {
  const a = await h.render('<form><input id="a" value="v"></form>');
  a.querySelector('#a').value = 'typed';
  h.build.morph.morph(a, el('<form><input id="a" value="v"></form>'));
  assert.equal(a.querySelector('#a').value, 'typed');
});
gone('morph', 'a changed default value attribute overwrites the live value', async (h) => {
  const a = await h.render('<form><input id="b" value="v"></form>');
  a.querySelector('#b').value = 'typed';
  h.build.morph.morph(a, el('<form><input id="b" value="new"></form>'));
  assert.equal(a.querySelector('#b').value, 'new');
});
gone('morph', 'sigmx-prop-change is dispatched when a default changes', async (h) => {
  const a = await h.render('<div><input id="i" value="1"></div>');
  let seen = 0;
  a.addEventListener('sigmx-prop-change', () => seen++);
  h.build.morph.morph(a, el('<div><input id="i" value="2"></div>'));
  assert.equal(seen, 1);
});
probe('morph', 'data-preserve-attr keeps listed attributes', async (h) => {
  const a = await h.render('<div><p id="p" class="keep" data-preserve-attr="class">a</p></div>');
  h.build.morph.morph(a, el('<div><p id="p" class="new" data-preserve-attr="class">b</p></div>'));
  assert.equal(a.querySelector('#p').className, 'keep');
  assert.equal(a.querySelector('#p').textContent, 'b');
});
probe('morph', 'data-ignore-morph subtrees are left alone when marked on both sides', async (h) => {
  const a = await h.render('<div><section data-ignore-morph><em>old</em></section></div>');
  h.build.morph.morph(a, el('<div><section data-ignore-morph><em>new</em></section></div>'));
  assert.equal(a.textContent, 'old');
});
probe('morph', 'an id that changes tag is recreated', async (h) => {
  const a = await h.render('<div><span id="k">a</span></div>');
  h.build.morph.morph(a, el('<div><b id="k">a</b></div>'));
  assert.equal(a.querySelector('#k').tagName, 'B');
});
probe('morph', 'template contents and text nodes are updated', async (h) => {
  const a = await h.render('<div><template id="t">1</template>x</div>');
  h.build.morph.morph(a, el('<div><template id="t">2</template>y</div>'));
  assert.equal(a.querySelector('template').innerHTML, '2');
  assert.equal(a.lastChild.nodeValue, 'y');
});
probe('morph', 'morphInner morphs children only', async (h) => {
  const a = await h.render('<div class="c"><p>old</p></div>');
  const frag = document.createDocumentFragment();
  frag.append(el('<p>new</p>'));
  h.build.morph.morphInner(a, frag);
  assert.equal(a.className, 'c');
  assert.equal(a.textContent, 'new');
});
probe('morph', 'scripts arriving through the morph become executable copies', async (h) => {
  const a = await h.render('<div></div>');
  h.build.morph.morph(a, el('<div><script>1</script></div>'));
  const s = a.querySelector('script');
  assert.ok(s && s.text === '1');
});

// ---------------------------------------------------------------- server events
const handle = (h, name, data) => h.app().sigmx.runtime.handle(name, data);
probe('server events', 'patch-elements without a selector morphs top-level elements by id', async (h) => {
  const { sigmx } = h.app();
  await h.render('<div><p id="a">1</p></div>');
  sigmx.runtime.handle('patch-elements', { elements: '<p id="a">2</p>' });
  assert.equal(h.stage.querySelector('#a').textContent, '2');
});
probe('server events', 'patch-elements modes against a selector (inner, append, before, remove)', async (h) => {
  const { sigmx } = h.app();
  await h.render('<div id="t"><i>x</i></div>');
  const hd = (d) => sigmx.runtime.handle('patch-elements', { selector: '#t', ...d });
  hd({ mode: 'inner', elements: '<b>y</b>' });
  assert.equal(h.stage.querySelector('#t').innerHTML, '<b>y</b>');
  hd({ mode: 'append', elements: '<u>z</u>' });
  assert.equal(h.stage.querySelector('#t').textContent, 'yz');
  hd({ mode: 'before', elements: '<s>w</s>' });
  assert.equal(h.stage.firstElementChild.tagName, 'S');
  hd({ mode: 'remove' });
  assert.equal(h.stage.querySelector('#t'), null);
});
gone('server events', 'patch-elements rejects an unknown mode with "unknown mode"', async (h) => {
  assert.throws(() => handle(h, 'patch-elements', { mode: 'sideways', elements: '<p></p>' }), /unknown mode/);
});
probe('server events', 'patch-elements needs a selector for insertion modes', async (h) => {
  assert.throws(() => handle(h, 'patch-elements', { mode: 'append', elements: '<p></p>' }), /needs a selector/);
});
gone('server events', 'patch-elements warns about missing targets', async (h) => {
  const warned = [];
  h.stub(console, 'warn', (...a) => warned.push(a));
  handle(h, 'patch-elements', { elements: '<p id="missing"></p>' });
  assert.equal(warned.length, 1);
});
gone('server events', 'patch-elements useViewTransition wraps the patch', async (h) => {
  let called = 0;
  h.stub(document, 'startViewTransition', (fn) => {
    called++;
    fn();
  });
  const { sigmx } = h.app();
  await h.render('<p id="v">1</p>');
  sigmx.runtime.handle('patch-elements', { elements: '<p id="v">2</p>', useViewTransition: 'true' });
  assert.equal(called, 1);
});
probe('server events', 'patch-elements mounts directives inside new markup', async (h) => {
  const { sigmx, $ } = h.app();
  $.n = 4;
  await h.render('<div id="box"></div>');
  sigmx.runtime.handle('patch-elements', { selector: '#box', mode: 'inner', elements: '<b data-text="$n"></b>' });
  await tick();
  assert.equal(h.stage.querySelector('b').textContent, '4');
});
probe('server events', 'patch-signals merges JSON, honours onlyIfMissing', async (h) => {
  const { sigmx, $ } = h.app();
  $.a = 1;
  sigmx.runtime.handle('patch-signals', { signals: '{"a": 2, "b": 3}', onlyIfMissing: 'true' });
  assert.equal($.a, 1);
  assert.equal($.b, 3);
  sigmx.runtime.handle('patch-signals', { signals: '{a: 5}' });
  assert.equal($.a, 5, 'JS object literals are accepted');
});
// ---------------------------------------------------------------- requests
probe('requests', '@get sends signals in the query with the request headers; JSON replies merge', async (h) => {
  const calls = h.mockFetch(() => h.json({ got: 1 }));
  const { $ } = h.app();
  $.q = 'x';
  const el = await h.render('<button data-on:click="@get(\'/api/a\')"></button>');
  await click(el);
  await until(() => $.got === 1);
  const req = calls[0].req;
  assert.equal(JSON.parse(new URL(req.url).searchParams.get('sigmx')).q, 'x');
  assert.equal(req.headers.get('sigmx-request'), 'true');
  assert.match(req.headers.get('accept'), /text\/event-stream/);
});
probe('requests', '@post sends a JSON body; filter, payload and headers options', async (h) => {
  const calls = h.mockFetch(() => h.json({}));
  const { $ } = h.app();
  $.a = 1;
  $._secret = 2;
  const el = await h.render(
    '<div><button id="a" data-on:click="@post(\'/p\')"></button><button id="b" data-on:click="@post(\'/p2\', { payload: { z: 1 }, headers: { \'x-h\': \'y\' } })"></button></div>',
  );
  await click(el.querySelector('#a'));
  await until(() => calls.length === 1);
  assert.deepEqual(await calls[0].req.json(), { a: 1 }, 'underscore paths excluded by default');
  await click(el.querySelector('#b'));
  await until(() => calls.length === 2);
  assert.deepEqual(await calls[1].req.json(), { z: 1 });
  assert.equal(calls[1].req.headers.get('x-h'), 'y');
});
probe('requests', 'HTML replies morph by id, or by selector and mode headers', async (h) => {
  let n = 0;
  h.mockFetch(() =>
    ++n === 1
      ? h.html('<p id="r">server</p>')
      : h.html('<b>appended</b>', { 'sigmx-selector': '#box', 'sigmx-mode': 'append' }),
  );
  h.app();
  const el = await h.render('<div id="box"><p id="r">local</p><button data-on:click="@get(\'/h\')"></button></div>');
  await click(el.querySelector('button'));
  await until(() => el.querySelector('#r').textContent === 'server');
  await click(el.querySelector('button'));
  await until(() => el.querySelector('b'));
});
gone('requests', 'sigmx-use-view-transition response header wraps the patch', async (h) => {
  let called = 0;
  h.stub(document, 'startViewTransition', (fn) => {
    called++;
    fn();
  });
  h.mockFetch(() => h.html('<p id="vt">2</p>', { 'sigmx-use-view-transition': 'true' }));
  h.app();
  const el = await h.render('<div><p id="vt">1</p><button data-on:click="@get(\'/vt\')"></button></div>');
  await click(el.querySelector('button'));
  await until(() => el.querySelector('#vt').textContent === '2');
  assert.equal(called, 1);
});
probe('requests', 'JSON replies honour the only-if-missing header', async (h) => {
  h.mockFetch(() => h.json({ a: 9, b: 1 }, { 'sigmx-only-if-missing': 'true' }));
  const { $ } = h.app();
  $.a = 1;
  const el = await h.render('<button data-on:click="@get(\'/j\')"></button>');
  await click(el);
  await until(() => $.b === 1);
  assert.equal($.a, 1);
});
probe('requests', 'event-stream replies route every event and announce them', async (h) => {
  h.mockFetch(() => h.sse('event: sigmx-patch-signals\ndata: signals {"s": 1}\n\nevent: custom\ndata: k v\n\n'));
  const seen = h.events('sigmx-server-event');
  const { $ } = h.app();
  const el = await h.render('<button data-on:click="@get(\'/s\')"></button>');
  await click(el);
  await until(() => $.s === 1);
  await until(() => seen.some((e) => e.event === 'custom'));
  assert.deepEqual(seen.find((e) => e.event === 'custom').data, { k: 'v' });
});
probe('requests', 'status errors emit a sigmx-fetch error and do not throw', async (h) => {
  h.mockFetch(() => new h.native.Response('nope', { status: 500 }));
  const fetches = h.events('sigmx-fetch');
  h.app();
  const el = await h.render('<button data-on:click="@get(\'/f\')"></button>');
  await click(el);
  await until(() => fetches.some((f) => f.type === 'finished'));
  assert.ok(fetches.some((f) => f.type === 'error' && f.status === 500));
  assert.equal(h.errors.length, 0);
});
gone('requests', 'retry.onStatusError retries failing statuses with backoff', async (h) => {
  let n = 0;
  const calls = h.mockFetch(() => (++n < 3 ? new h.native.Response('', { status: 503 }) : h.json({ ok: n })));
  const { $ } = h.app();
  const el = await h.render(
    '<button data-on:click="@get(\'/r\', { retry: { onStatusError: true, interval: 1, attempts: 5 } })"></button>',
  );
  await click(el);
  await until(() => $.ok === 3, 1000);
  assert.equal(calls.length, 3);
});
probe('requests', 'network errors are retried with backoff', async (h) => {
  let n = 0;
  const calls = h.mockFetch(() => {
    if (++n < 3) throw new TypeError('offline');
    return h.json({ ok: n });
  });
  const { $ } = h.app();
  const el = await h.render('<button data-on:click="@get(\'/n\', { retry: { interval: 1 } })"></button>');
  await click(el);
  await until(() => $.ok === 3, 1000);
  assert.equal(calls.length, 3);
});
gone('requests', 'a "retrying" fetch event is emitted before each retry', async (h) => {
  let n = 0;
  h.mockFetch(() => {
    if (++n < 2) throw new TypeError('offline');
    return h.json({ ok: n });
  });
  const fetches = h.events('sigmx-fetch');
  const { $ } = h.app();
  const el = await h.render('<button data-on:click="@get(\'/n2\', { retry: { interval: 1 } })"></button>');
  await click(el);
  await until(() => $.ok === 2, 1000);
  assert.ok(fetches.some((f) => f.type === 'retrying'));
});
probe('requests', 'a second request to the same URL aborts the first; abort: none lets them overlap', async (h) => {
  const calls = h.mockFetch(() => new Promise(() => {}));
  h.app();
  const el = await h.render(
    '<div><button id="a" data-on:click="@get(\'/same\')"></button><button id="b" data-on:click="@get(\'/same\', { abort: \'none\' })"></button></div>',
  );
  await click(el.querySelector('#a'));
  await click(el.querySelector('#a'));
  await until(() => calls.length === 2);
  assert.equal(calls[0].init.signal.aborted, true);
  assert.equal(calls[1].init.signal.aborted, false);
  await click(el.querySelector('#b'));
  await until(() => calls.length === 3);
  assert.equal(calls[1].init.signal.aborted, false);
});
gone('requests', 'a caller-supplied AbortController aborts the request', async (h) => {
  const calls = h.mockFetch(() => new Promise(() => {}));
  const { $ } = h.app();
  $.ac = new AbortController();
  const el = await h.render('<button data-on:click="@get(\'/ac\', { abort: $ac })"></button>');
  await click(el);
  await until(() => calls.length === 1);
  $.ac.abort();
  assert.equal(calls[0].init.signal.aborted, true);
});
probe('requests', 'requests made inside an attribute are aborted when it unmounts', async (h) => {
  const calls = h.mockFetch(() => new Promise(() => {}));
  h.app();
  const el = await h.render('<div data-init="@get(\'/u\')"></div>');
  await until(() => calls.length === 1);
  el.remove();
  await tick();
  assert.equal(calls[0].init.signal.aborted, true);
});
gone('requests', 'GET streams pause while the tab is hidden', async (h) => {
  const calls = h.mockFetch(() => new Promise(() => {}));
  h.app();
  const el = await h.render('<button data-on:click="@get(\'/hide\')"></button>');
  await click(el);
  await until(() => calls.length === 1);
  h.stub(document, 'hidden', true);
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls[0].init.signal.aborted, true);
});
probe('requests', 'contentType form posts urlencoded fields and respects validity', async (h) => {
  const calls = h.mockFetch(() => h.json({}));
  h.app();
  h.stub(HTMLFormElement.prototype, 'reportValidity', () => false);
  const el = await h.render(
    '<form data-on:submit="@post(\'/form\', { contentType: \'form\' })"><input name="q" value="v" required></form>',
  );
  const submit = () => el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  submit();
  await until(() => calls.length === 1);
  assert.equal(await calls[0].req.text(), 'q=v');
  assert.match(calls[0].req.headers.get('content-type'), /urlencoded/);
  el.querySelector('input').value = '';
  submit();
  await tick(20);
  assert.equal(calls.length, 1, 'invalid form does not send');
});
probe('requests', 'contentType form on GET appends the fields to the query', async (h) => {
  const calls = h.mockFetch(() => h.json({}));
  h.app();
  const el = await h.render(
    '<form data-on:submit="@get(\'/fg\', { contentType: \'form\' })"><input name="q" value="v"></form>',
  );
  el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(() => calls.length === 1);
  assert.equal(new URL(calls[0].req.url).searchParams.get('q'), 'v');
});
probe('requests', 'reconnect resumes a stream with Last-Event-ID', async (h) => {
  let n = 0;
  const calls = h.mockFetch(() =>
    ++n === 1 ? h.sse('id: 7\nevent: sigmx-patch-signals\ndata: signals {"n": 1}\n\n') : h.json({ done: true }),
  );
  const { $ } = h.app();
  const el = await h.render(
    '<button data-on:click="@get(\'/re\', { reconnect: true, retry: { interval: 1 } })"></button>',
  );
  await click(el);
  await until(() => $.done === true, 1500);
  assert.equal(calls[1].req.headers.get('last-event-id'), '7');
});
probe('requests', '@delete sends signals in the query like GET, without a body', async (h) => {
  const calls = h.mockFetch(() => h.json({}));
  const { $ } = h.app();
  $.q = 1;
  const el = await h.render('<button data-on:click="@delete(\'/d\')"></button>');
  await click(el);
  await until(() => calls.length === 1);
  assert.equal(calls[0].req.method, 'DELETE');
  assert.ok(new URL(calls[0].req.url).searchParams.get('sigmx'));
});
probe('requests', 'indicator is true while a request from the element or a descendant is in flight', async (h) => {
  let release;
  h.mockFetch(() => new Promise((r) => (release = () => r(new h.native.Response(null, { status: 204 })))));
  const { $ } = h.app();
  const el = await h.render('<div data-indicator:busy><button data-on:click="@get(\'/ind\')"></button></div>');
  assert.equal($.busy, false);
  await click(el.querySelector('button'));
  await until(() => $.busy === true);
  await until(() => release);
  release();
  await until(() => $.busy === false);
});

// ---------------------------------------------------------------- bind
probe('bind', 'text input works both ways and seeds the signal from the element', async (h) => {
  const { $ } = h.app();
  const el = await h.render('<input data-bind:name value="seed">');
  assert.equal($.name, 'seed');
  input(el, 'typed');
  assert.equal($.name, 'typed');
  $.name = 'set';
  assert.equal(el.value, 'set');
});
probe('bind', 'number and range inputs bind numbers', async (h) => {
  const { $ } = h.app();
  await h.render('<input type="number" data-bind:n value="3">');
  assert.equal($.n, 3);
});
probe('bind', 'checkboxes: boolean, array group, own value', async (h) => {
  const { $ } = h.app();
  $.tags = ['a'];
  const el = await h.render(
    '<div><input id="b" type="checkbox" data-bind:on><input id="t1" type="checkbox" value="a" data-bind:tags><input id="t2" type="checkbox" value="b" data-bind:tags></div>',
  );
  assert.equal($.on, false);
  el.querySelector('#b').click();
  assert.equal($.on, true);
  assert.equal(el.querySelector('#t1').checked, true);
  el.querySelector('#t2').click();
  assert.deepEqual([...$.tags].sort(), ['a', 'b']);
});
probe('bind', 'radios bind the checked value', async (h) => {
  const { $ } = h.app();
  const el = await h.render(
    '<div><input type="radio" value="x" data-bind:pick><input type="radio" value="y" data-bind:pick></div>',
  );
  el.children[1].click();
  assert.equal($.pick, 'y');
});
probe('bind', 'select single and multiple', async (h) => {
  const { $ } = h.app();
  $.m = ['b'];
  const el = await h.render(
    '<div><select data-bind:s><option>a</option><option selected>b</option></select><select multiple data-bind:m><option>a</option><option>b</option></select></div>',
  );
  assert.equal($.s, 'b');
  const [ma, mb] = el.children[1].options;
  assert.equal(mb.selected, true);
  ma.selected = true;
  el.children[1].dispatchEvent(new Event('change', { bubbles: true }));
  assert.deepEqual([...$.m].sort(), ['a', 'b']);
});
probe('bind', 'textarea and __event adapters', async (h) => {
  const { $ } = h.app();
  $.note = 'n';
  const el = await h.render('<div><textarea data-bind:note></textarea><input data-bind:late__event.change></div>');
  assert.equal(el.children[0].value, 'n');
  input(el.children[1], 'typing');
  assert.equal($.late, undefined);
  el.children[1].dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal($.late, 'typing');
});
gone('bind', '__prop binds an element property', async (h) => {
  const { $ } = h.app();
  $.hide = true;
  const el = await h.render('<p data-bind:hide__prop.hidden></p>');
  assert.equal(el.hidden, true);
});
gone('bind', 'file inputs bind an array of file descriptors', async (h) => {
  const { store } = h.app();
  const el = await h.render('<input type="file" data-bind:files>');
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await tick(10);
  assert.ok(Array.isArray(store.get('files')));
});

// ---------------------------------------------------------------- directives
probe('directives', 'signals: object form, keyed form, __ifmissing', async (h) => {
  const { $ } = h.app();
  $.keep = 1;
  await h.render(
    '<div data-signals="{ a: 1, n: { b: 2 } }" data-signals:c="3" data-signals__ifmissing="{ keep: 9 }"></div>',
  );
  assert.equal($.a, 1);
  assert.equal($.n.b, 2);
  assert.equal($.c, 3);
  assert.equal($.keep, 1);
});
probe('directives', 'computed: keyed expression', async (h) => {
  const { $ } = h.app();
  $.n = 2;
  await h.render('<div data-computed:double="$n * 2"></div>');
  assert.equal($.double, 4);
  $.n = 5;
  assert.equal($.double, 10);
});
gone('directives', 'computed: object of functions', async (h) => {
  const { $ } = h.app();
  $.n = 2;
  await h.render('<div data-computed="{ triple: () => $n * 3 }"></div>');
  assert.equal($.triple, 6);
});
probe('directives', 'effect runs now and on every dependency change', async (h) => {
  const { $ } = h.app();
  $.n = 1;
  await h.render('<div data-effect="$seen = $n"></div>');
  $.n = 2;
  assert.equal($.seen, 2);
});
probe('directives', 'ref stores the element and clears it on unmount', async (h) => {
  const { $, store } = h.app();
  const el = await h.render('<p data-ref:para></p>');
  assert.equal($.para, el);
  el.remove();
  await tick();
  assert.equal(store.has('para'), false);
});
probe('directives', 'show toggles display and restores it', async (h) => {
  const { $ } = h.app();
  $.open = false;
  const el = await h.render('<div style="display: flex" data-show="$open"></div>');
  assert.equal(el.style.display, 'none');
  $.open = true;
  assert.equal(el.style.display, 'flex');
});
probe('directives', 'class: keyed and object forms with multi-class keys', async (h) => {
  const { $ } = h.app();
  $.on = true;
  const el = await h.render('<div data-class:is-on="$on" data-class="{ \'a b\': $on }"></div>');
  assert.equal(el.className.split(' ').sort().join(' '), 'a b is-on');
  $.on = false;
  assert.equal(el.className, '');
});
probe('directives', 'style: keyed and object forms; zero is kept', async (h) => {
  const { $ } = h.app();
  $.c = 'red';
  $.o = 0;
  const el = await h.render('<div data-style:color="$c" data-style="{ opacity: $o }"></div>');
  assert.equal(el.style.color, 'red');
  assert.equal(el.style.opacity, '0');
});
gone('directives', 'style: a falsy value restores the original inline value', async (h) => {
  const { $ } = h.app();
  $.c = 'red';
  const el = await h.render('<div style="color: blue" data-style:color="$c"></div>');
  $.c = '';
  assert.equal(el.style.color, 'blue');
});
probe('directives', 'attr: true is bare, false and null remove', async (h) => {
  const { $ } = h.app();
  $.dis = true;
  const el = await h.render('<button data-attr:disabled="$dis" data-attr="{ title: $t }"></button>');
  assert.equal(el.getAttribute('disabled'), '');
  $.dis = false;
  $.t = 'hi';
  assert.equal(el.hasAttribute('disabled'), false);
  assert.equal(el.getAttribute('title'), 'hi');
});
gone('directives', 'attr: objects serialise as JSON', async (h) => {
  const { $ } = h.app();
  $.meta = { a: 1 };
  const el = await h.render('<div data-attr:data-meta="$meta"></div>');
  assert.equal(el.getAttribute('data-meta'), '{"a":1}');
});
probe('directives', 'html sets innerHTML reactively', async (h) => {
  const { $ } = h.app();
  $.h = '<b>x</b>';
  const el = await h.render('<div data-html="$h"></div>');
  assert.equal(el.innerHTML, '<b>x</b>');
});
probe('directives', 'init runs once on mount', async (h) => {
  const { $ } = h.app();
  $.n = 0;
  await h.render('<div data-init="$n++"></div>');
  assert.equal($.n, 1);
});
probe('directives', 'on: runs with evt; __once, __prevent, __stop', async (h) => {
  const { $ } = h.app();
  $.n = 0;
  $.outer = 0;
  const el = await h.render(
    '<div data-on:click="$outer++"><button id="a" data-on:click__once="$n++"></button><button id="b" data-on:click__stop__prevent="$type = evt.type"></button></div>',
  );
  el.querySelector('#a').click();
  el.querySelector('#a').click();
  assert.equal($.n, 1);
  const e = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.querySelector('#b').dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
  assert.equal($.type, 'click');
  assert.equal($.outer, 2, 'stop kept the second click from the parent');
});
probe('directives', 'on: __window, __document and __outside targets', async (h) => {
  const { $ } = h.app();
  $.w = 0;
  $.o = 0;
  const el = await h.render('<div><b data-on:resize__window="$w++"></b><i data-on:click__outside="$o++"></i></div>');
  window.dispatchEvent(new Event('resize'));
  assert.equal($.w, 1);
  el.querySelector('b').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal($.o, 1);
  el.querySelector('i').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal($.o, 1, 'clicks inside do not count');
});
probe('directives', 'on: form submit is always prevented', async (h) => {
  h.app();
  const el = await h.render('<form data-on:submit="$s = 1"></form>');
  const e = new Event('submit', { cancelable: true, bubbles: true });
  el.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
});
gone('directives', 'on: __capture registers a capturing listener', async (h) => {
  const { $ } = h.app();
  $.c = 0;
  const el = await h.render('<div data-on:click__capture="$c++"><button></button></div>');
  el.querySelector('button').addEventListener('click', (e) => e.stopPropagation());
  el.querySelector('button').click();
  assert.equal($.c, 1);
});
probe('directives', 'on-interval ticks until unmounted', async (h) => {
  const { $ } = h.app();
  $.n = 0;
  const el = await h.render('<div data-on-interval__duration.10ms="$n++"></div>');
  await until(() => $.n >= 2);
  el.remove();
  await tick();
  const n = $.n;
  await tick(30);
  assert.equal($.n, n);
});
gone('directives', 'on-interval .leading fires immediately', async (h) => {
  const { $ } = h.app();
  $.m = 0;
  await h.render('<div data-on-interval__duration.60ms.leading="$m++"></div>');
  assert.equal($.m, 1);
});
probe('directives', 'on-raf runs every frame until unmounted', async (h) => {
  const { $ } = h.app();
  $.f = 0;
  const el = await h.render('<div data-on-raf="$f++"></div>');
  await until(() => $.f >= 2);
  el.remove();
});
probe('directives', 'on-resize observes with ResizeObserver', async (h) => {
  const obs = fakeObserver(h, 'ResizeObserver');
  const { $ } = h.app();
  $.r = 0;
  await h.render('<div data-on-resize="$r++"></div>');
  obs[0].fire({});
  assert.equal($.r, 1);
});
probe('directives', 'on-intersect: enter, __once, __exit, __threshold.N', async (h) => {
  const obs = fakeObserver(h, 'IntersectionObserver');
  const { $ } = h.app();
  $.seen = 0;
  $.once = 0;
  $.left = 0;
  await h.render(
    '<div><p data-on-intersect="$seen++"></p><p data-on-intersect__once="$once++"></p><p data-on-intersect__exit="$left++"></p><p data-on-intersect__threshold.25="1"></p></div>',
  );
  const [plain, once, exit, quarter] = obs;
  plain.fire({ isIntersecting: true });
  plain.fire({ isIntersecting: true });
  assert.equal($.seen, 2);
  once.fire({ isIntersecting: true });
  once.fire({ isIntersecting: true });
  assert.equal($.once, 1);
  exit.fire({ isIntersecting: false });
  assert.equal($.left, 1);
  assert.equal(quarter.options.threshold, 0.25);
});
gone('directives', 'on-intersect __half and __full thresholds', async (h) => {
  const obs = fakeObserver(h, 'IntersectionObserver');
  h.app();
  await h.render('<div><p data-on-intersect__half="1"></p><p data-on-intersect__full="1"></p></div>');
  assert.equal(obs[0].options.threshold, 0.5);
  assert.equal(obs[1].options.threshold, 1);
});
probe('directives', 'on-signal-patch receives every patch', async (h) => {
  const { $ } = h.app();
  $.all = [];
  await h.render('<div data-on-signal-patch="$all.push(Object.keys(patch)[0])"></div>');
  $.other = 1;
  await tick();
  assert.ok([...$.all].includes('other'));
});
gone('directives', 'on-signal-patch:key fires only for patches touching the key', async (h) => {
  const { $ } = h.app();
  $.user = { name: 'a' };
  await h.render('<div data-on-signal-patch:user.name="$hits = ($hits ?? 0) + 1"></div>');
  $.other = 1;
  await tick();
  assert.equal($.hits, undefined, 'unrelated patch ignored');
  $.user.name = 'b';
  await tick();
  assert.equal($.hits, 1);
});
probe('directives', 'json-signals renders the store, optionally filtered', async (h) => {
  const { $ } = h.app();
  $.a = 1;
  const el = await h.render('<pre data-json-signals="{ include: /^a/ }"></pre>');
  assert.equal(JSON.parse(el.textContent).a, 1);
});
gone('directives', 'json-signals __terse renders a single line', async (h) => {
  const { $ } = h.app();
  $.a = 1;
  const el = await h.render('<pre data-json-signals__terse></pre>');
  assert.equal(el.textContent.includes('\n'), false);
});
probe('directives', 'persist restores from localStorage and saves changes', async (h) => {
  localStorage.setItem('audit', JSON.stringify({ theme: 'dark' }));
  h.after(() => localStorage.removeItem('audit'));
  const { $ } = h.app();
  await h.render('<div data-persist:audit></div>');
  assert.equal($.theme, 'dark');
  $.theme = 'sepia';
  assert.equal(JSON.parse(localStorage.getItem('audit')).theme, 'sepia');
});
gone('directives', 'persist __session uses sessionStorage', async (h) => {
  h.after(() => sessionStorage.removeItem('audit-s'));
  const { $ } = h.app();
  $.x = 1;
  await h.render('<div data-persist:audit-s__session></div>');
  assert.ok(sessionStorage.getItem('audit-s'));
});
probe('directives', 'query-string:key declares a default, reads and writes the URL', async (h) => {
  const before = location.href;
  h.after(() => history.replaceState(null, '', before));
  history.replaceState(null, '', '/audit?page=3');
  const { $ } = h.app();
  await h.render('<div data-query-string:page="1"></div>');
  assert.equal($.page, 3);
  $.page = 4;
  assert.equal(new URLSearchParams(location.search).get('page'), '4');
  $.page = 1;
  assert.equal(new URLSearchParams(location.search).has('page'), false, 'default is dropped');
});
gone('directives', 'bare query-string mirrors matching signals', async (h) => {
  const before = location.href;
  h.after(() => history.replaceState(null, '', before));
  history.replaceState(null, '', '/audit?q=hello');
  const { $ } = h.app();
  $.q = '';
  await h.render('<div data-query-string="{ include: /^q$/ }"></div>');
  assert.equal($.q, 'hello');
});
probe('directives', 'replace-url rewrites the address', async (h) => {
  const before = location.href;
  h.after(() => history.replaceState(null, '', before));
  const { $ } = h.app();
  $.p = '/rewritten';
  await h.render('<div data-replace-url="$p"></div>');
  assert.equal(location.pathname, '/rewritten');
});
probe('directives', 'match-media wraps bare queries and tracks matches', async (h) => {
  const listeners = [];
  h.stub(window, 'matchMedia', (q) => ({
    matches: q.includes('dark'),
    media: q,
    addEventListener: (_, f) => listeners.push([q, f]),
    removeEventListener() {},
  }));
  const { $ } = h.app();
  await h.render('<div data-match-media:is-dark="\'prefers-color-scheme: dark\'"></div>');
  assert.equal($.isDark, true);
  assert.equal(listeners[0][0], '(prefers-color-scheme: dark)');
});
probe('directives', 'scroll-into-view: behavior and block modifiers, focus', async (h) => {
  const calls = [];
  h.stub(Element.prototype, 'scrollIntoView', (o) => {
    calls.push(o);
  });
  h.app();
  await h.render('<input data-scroll-into-view__instant__vstart__focus>');
  assert.equal(calls[0].behavior, 'instant');
  assert.equal(calls[0].block, 'start');
});
gone('directives', 'scroll-into-view: horizontal (inline) modifiers', async (h) => {
  const calls = [];
  h.stub(Element.prototype, 'scrollIntoView', (o) => {
    calls.push(o);
  });
  h.app();
  await h.render('<p data-scroll-into-view__hstart></p>');
  assert.equal(calls[0].inline, 'start');
});
probe('directives', 'teleport moves the element to the target', async (h) => {
  const target = document.createElement('div');
  target.id = 'tele';
  document.body.append(target);
  h.after(() => target.remove());
  h.app();
  await h.render('<p id="tp" data-teleport="#tele">a</p>');
  assert.equal(target.querySelector('#tp')?.textContent, 'a');
});
gone('directives', 'teleport __prepend inserts first', async (h) => {
  const target = document.createElement('div');
  target.id = 'tele2';
  target.innerHTML = '<span>existing</span>';
  document.body.append(target);
  h.after(() => target.remove());
  h.app();
  await h.render('<p id="tp2" data-teleport__prepend="#tele2">b</p>');
  assert.equal(target.children[0].id, 'tp2');
});
probe('directives', 'remove-me removes after its delay', async (h) => {
  h.app();
  const el = await h.render('<p data-remove-me="10ms"></p>');
  await until(() => !el.isConnected);
});
probe('directives', 'custom-validity sets the validation message', async (h) => {
  const { $ } = h.app();
  $.msg = 'bad';
  const el = await h.render('<input data-custom-validity="$msg">');
  assert.equal(el.validationMessage, 'bad');
});
probe('directives', 'cloak is removed on mount', async (h) => {
  h.app();
  const el = await h.render('<div data-cloak></div>');
  assert.equal(el.hasAttribute('data-cloak'), false);
});
probe('directives', 'view-transition sets view-transition-name', async (h) => {
  h.app();
  const el = await h.render('<div data-view-transition="\'hero\'"></div>');
  assert.equal(el.style.getPropertyValue('view-transition-name'), 'hero');
});
probe('directives', 'mask formats as the user types; __dynamic follows a signal', async (h) => {
  const { $ } = h.app();
  $.pattern = '99-99';
  const el = await h.render(
    '<div><input id="m" data-mask="(999) 999"><input id="d" data-mask__dynamic="$pattern"></div>',
  );
  input(el.querySelector('#m'), '1234');
  assert.equal(el.querySelector('#m').value, '(123) 4');
  input(el.querySelector('#d'), '1234');
  assert.equal(el.querySelector('#d').value, '12-34');
});
probe('directives', 'trap cycles Tab inside and restores focus', async (h) => {
  h.stub(HTMLElement.prototype, 'offsetParent', undefined);
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { get: () => document.body, configurable: true });
  const { $ } = h.app();
  $.open = false;
  const el = await h.render(
    '<div><button id="out"></button><div data-trap="$open"><button id="a"></button><button id="b"></button></div></div>',
  );
  el.querySelector('#out').focus();
  $.open = true;
  await tick();
  assert.equal(document.activeElement.id, 'a');
  el.querySelector('#b').focus();
  const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  assert.equal(document.activeElement.id, 'a');
  $.open = false;
  assert.equal(document.activeElement.id, 'out');
});
gone('directives', 'trap __inert makes the rest of the page inert', async (h) => {
  h.stub(HTMLElement.prototype, 'offsetParent', undefined);
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { get: () => document.body, configurable: true });
  const { $ } = h.app();
  $.open = true;
  const el = await h.render('<div><p id="sib"></p><div data-trap__inert="$open"><button></button></div></div>');
  await tick();
  assert.equal(el.querySelector('#sib').hasAttribute('inert'), true);
});
const fakeAnimate = (h) => {
  const calls = [];
  h.stub(Element.prototype, 'animate', (keyframes, options) => {
    const anim = { keyframes, options, cancel() {}, onfinish: null };
    calls.push(anim);
    return anim;
  });
  return calls;
};
probe('directives', 'transition fades in and out and hides after the exit animation', async (h) => {
  const calls = fakeAnimate(h);
  const { $ } = h.app();
  $.open = false;
  const el = await h.render('<div style="display: flex" data-transition__duration.50ms="$open"></div>');
  assert.equal(el.style.display, 'none');
  $.open = true;
  assert.equal(el.style.display, 'flex');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].keyframes[0].opacity, 0);
  $.open = false;
  calls[1].onfinish();
  assert.equal(el.style.display, 'none');
});
gone('directives', 'transition __scale / __origin', async (h) => {
  const calls = fakeAnimate(h);
  const { $ } = h.app();
  $.open = false;
  const el = await h.render('<div data-transition__scale.90__origin.top="$open"></div>');
  assert.equal(el.style.transformOrigin, 'top');
  $.open = true;
  assert.equal(calls[0].keyframes[0].transform, 'scale(0.9)');
});
probe('directives', 'collapse animates height and settles', async (h) => {
  const { $ } = h.app();
  $.open = false;
  const el = await h.render('<div data-collapse__duration.30ms="$open"><p>c</p></div>');
  assert.equal(el.style.height, '0px');
  $.open = true;
  assert.match(el.style.transition, /height 30ms/);
  await until(() => el.style.height === '');
});
gone('directives', 'collapse __min sets the collapsed height', async (h) => {
  const { $ } = h.app();
  $.open = false;
  const el = await h.render('<div data-collapse__min.24px="$open"></div>');
  assert.equal(el.style.height, '24px');
});
const cssSupports = (h) => h.stub(globalThis, 'CSS', { supports: (p) => p !== 'r', escape: (s) => s });
probe('directives', 'animate tweens numeric CSS values', async (h) => {
  cssSupports(h);
  const { $ } = h.app();
  $.o = 0;
  const el = await h.render('<div data-animate:opacity__duration.40ms="$o"></div>');
  assert.equal(el.style.opacity, '0');
  $.o = 1;
  await until(() => el.style.opacity !== '0' && el.style.opacity !== '1', 1000);
  await until(() => el.style.opacity === '1', 1000);
});
gone('directives', 'animate writes SVG attributes', async (h) => {
  cssSupports(h);
  const { $ } = h.app();
  $.r = 5;
  const el = await h.render('<svg><circle data-animate:r__duration.30ms="$r"></circle></svg>');
  assert.equal(el.querySelector('circle').getAttribute('r'), '5');
});
probe('directives', 'boost turns same-origin links into GET requests with a history entry', async (h) => {
  const before = location.href;
  h.after(() => history.replaceState(null, '', before));
  const calls = h.mockFetch(() => h.html(`<html><body>${document.body.innerHTML}</body></html>`));
  h.app();
  const el = await h.render('<div data-boost><a id="l" href="/page-two">go</a></div>');
  el.querySelector('#l').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await until(() => calls.length === 1);
  assert.equal(new URL(calls[0].req.url).pathname, '/page-two');
  assert.equal(location.pathname, '/page-two');
});
probe('directives', 'boost submits forms as requests', async (h) => {
  const before = location.href;
  h.after(() => history.replaceState(null, '', before));
  const calls = h.mockFetch(() => h.json({}));
  h.app();
  const el = await h.render(
    '<div data-boost><form method="post" action="/save"><input name="q" value="v"></form></div>',
  );
  el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(() => calls.length === 1);
  assert.equal(calls[0].req.method, 'POST');
  assert.equal(await calls[0].req.text(), 'q=v');
});
gone('directives', 'boost __replace replaces the history entry', async (h) => {
  const before = location.href;
  h.after(() => history.replaceState(null, '', before));
  const calls = [];
  h.stub(history, 'pushState', (...a) => calls.push(['push', a]));
  h.stub(history, 'replaceState', (...a) => calls.push(['replace', a]));
  h.mockFetch(() => h.json({}));
  h.app();
  const el = await h.render('<div data-boost__replace><a id="l" href="/three">go</a></div>');
  el.querySelector('#l').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await until(() => calls.length >= 1);
  assert.equal(calls[0][0], 'replace');
});

// ---------------------------------------------------------------- functions
probe('functions', '@intl with Intl constructor names', async (h) => {
  const { $ } = h.app();
  await h.render(
    "<div data-signals=\"{ m: @intl('NumberFormat', 1234.5, { style: 'currency', currency: 'USD' }, 'en-US'), p: @intl('PluralRules', 1, undefined, 'en') }\"></div>",
  );
  assert.equal($.m, '$1,234.50');
  assert.equal($.p, 'one');
});
gone('functions', '@intl aliases (number, datetime, list, pluralRules, relativeTime, displayNames)', async (h) => {
  const { $ } = h.app();
  await h.render(
    "<div data-signals=\"{ m: @intl('number', 1234.5, { style: 'currency', currency: 'USD' }, 'en-US') }\"></div>",
  );
  assert.equal($.m, '$1,234.50');
});
probe('functions', '@intl rejects unknown kinds', async (h) => {
  h.app();
  await h.render('<div data-init="@intl(\'nope\', 1)"></div>');
  assert.match(h.errors.at(-1)?.message ?? '', /unknown @intl type/);
});
probe('functions', '@fit maps ranges with clamp and round', async (h) => {
  const { $ } = h.app();
  await h.render(
    '<div data-signals="{ a: @fit(5, 0, 10, 0, 100), b: @fit(20, 0, 10, 0, 100, true), c: @fit(1, 0, 3, 0, 10, false, true) }"></div>',
  );
  assert.deepEqual([$.a, $.b, $.c], [50, 100, 3]);
});
probe('functions', '@setAll and @toggleAll act on matching paths', async (h) => {
  const { $ } = h.app();
  $.a = false;
  $.b = false;
  $.c = 1;
  await h.render('<div data-init="@toggleAll({ include: /^[ab]$/ }); @setAll(7, { include: /^c$/ })"></div>');
  assert.deepEqual([$.a, $.b, $.c], [true, true, 7]);
});
probe('functions', '@peek reads without subscribing', async (h) => {
  const { $ } = h.app();
  $.x = 1;
  $.y = 10;
  await h.render('<div data-computed:sum="@peek(() => $x) + $y"></div>');
  assert.equal($.sum, 11);
  $.x = 5;
  assert.equal($.sum, 11, 'x is not a dependency');
  $.y = 20;
  assert.equal($.sum, 25);
});
probe('functions', '@dispatch fires a bubbling composed CustomEvent', async (h) => {
  h.app();
  let seen;
  h.stage.addEventListener('ping', (e) => (seen = e));
  await h.render('<div data-init="@dispatch(\'ping\', { x: 1 })"></div>');
  assert.equal(seen.detail.x, 1);
  assert.equal(seen.composed, true);
});
probe('functions', '@confirm asks window.confirm', async (h) => {
  h.stub(window, 'confirm', () => true);
  const { $ } = h.app();
  await h.render('<div data-init="$ok = @confirm(\'sure?\')"></div>');
  assert.equal($.ok, true);
});
probe('functions', '@clipboard writes text, decoding base64 when asked', async (h) => {
  const written = [];
  h.stub(navigator, 'clipboard', { writeText: async (t) => written.push(t) });
  h.app();
  await h.render("<div data-init=\"@clipboard('hi'); @clipboard('aGk=', true)\"></div>");
  await tick();
  assert.deepEqual(written, ['hi', 'hi']);
});
const fakeSocket = (h) => {
  const sockets = [];
  h.stub(
    globalThis,
    'WebSocket',
    class {
      constructor(url, protocols) {
        this.url = String(url);
        this.protocols = protocols;
        this.sent = [];
        sockets.push(this);
      }
      send(d) {
        this.sent.push(d);
      }
      close() {
        this.closed = true;
      }
    },
  );
  return sockets;
};
probe('functions', '@ws routes blocks as server events, sends JSON, closes on unmount', async (h) => {
  const sockets = fakeSocket(h);
  const { $ } = h.app();
  const el = await h.render(
    '<div data-init="$sock = @ws(\'/live\', { protocols: [\'v1\'] })"><button data-on:click="$sock.send({ hi: 1 })"></button></div>',
  );
  assert.deepEqual(sockets[0].protocols, ['v1']);
  sockets[0].onmessage({ data: 'event: sigmx-patch-signals\ndata: signals {"a": 1}' });
  assert.equal($.a, 1);
  el.querySelector('button').click();
  assert.deepEqual(sockets[0].sent, ['{"hi":1}']);
  el.remove();
  await tick();
  assert.equal(sockets[0].closed, true);
});
gone('functions', '@ws dispatches event-only blocks (no data lines)', async (h) => {
  const sockets = fakeSocket(h);
  const seen = h.events('sigmx-server-event');
  h.app();
  await h.render('<div data-init="@ws(\'/live2\')"></div>');
  sockets[0].onmessage({ data: 'event: ping' });
  assert.equal(seen.length, 1);
});

// ---------------------------------------------------------------- libraries
probe('lib', 'readEvents parses chunked streams with ids, retry and comments', async (h) => {
  const chunks = [
    'event: a\nid: 1\ndata: x 1\ndata: y',
    ' 2\n\n: comment\nretry: 250\r\nevent: b\r\ndata: z\r\n\r\ndata: tail',
  ];
  const enc = new TextEncoder();
  const body = new h.native.ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  const events = [];
  await h.build.sse.readEvents(body, (e) => events.push(e));
  assert.deepEqual(
    events.map((e) => [e.event, e.data, e.id, e.retry]),
    [
      ['a', 'x 1\ny 2', '1', undefined],
      ['b', 'z', '1', 250],
      ['message', 'tail', '1', 250],
    ],
  );
});
probe('lib', 'casing helpers: camel, kebab, snake, pascal, recase', async (h) => {
  const { camel, kebab, snake, pascal, recase } = h.build.casing;
  assert.equal(camel('user-first-name'), 'userFirstName');
  assert.equal(kebab('userFirstName'), 'user-first-name');
  assert.equal(snake('UserFirstName'), 'user_first_name');
  assert.equal(pascal('user-first-name'), 'UserFirstName');
  assert.equal(recase('user.first-name', 'camel'), 'user.firstName');
});
probe('lib', 'debounce, throttle and delay helpers', async (h) => {
  const { debounce, throttle, delay } = h.build.schedule;
  const calls = [];
  const d = debounce((x) => calls.push(x), 5);
  d(1);
  d(2);
  await tick(20);
  const t = throttle((x) => calls.push(x), 50);
  t(3);
  t(4);
  delay((x) => calls.push(x), 1)(5);
  await tick(10);
  assert.deepEqual(calls, [2, 3, 5]);
});

export const probes = P;

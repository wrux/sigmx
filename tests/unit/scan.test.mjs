import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  builtinPlugins,
  customPluginMeta,
  generatePluginsModule,
  mentions,
  selectPlugins,
} from '../../dist/kernel/scan.js';

test('builtin metadata covers every plugin with export and registered names', () => {
  const all = builtinPlugins();
  assert.ok(all.length >= 50);
  const get = all.find((p) => p.export === 'httpGet');
  assert.deepEqual([get.name, get.type, get.from], ['get', 'action', 'sigmx/plugins']);
  assert.equal(all.find((p) => p.export === 'className').name, 'class');
});

test('mentions: directives by prefix, functions by @name(, handlers by string', () => {
  const text = builtinPlugins().find((p) => p.export === 'text');
  assert.equal(mentions('<b data-text="$n">', text, ['data-']), true);
  assert.equal(mentions('<b hx-text="$n">', text, ['data-']), false);
  assert.equal(mentions('<b hx-text="$n">', text, ['data-', 'hx-']), true);
  assert.equal(mentions('<b data-textual="x">', text, ['data-']), false);
  assert.equal(mentions('<b data-text__once="x">', text, ['data-']), true);
  const post = builtinPlugins().find((p) => p.export === 'httpPost');
  assert.equal(mentions('data-on:click="@post(\'/x\')"', post, ['data-']), true);
  assert.equal(mentions('mail me @post office', post, ['data-']), false);
});

test('selectPlugins: usage, implied dependencies, always, unused', () => {
  const sel = selectPlugins(
    ['<div data-signals="{n:1}"><b data-text="$n"></b><button data-on:click="@get(\'/x\')"></button></div>'],
    { always: ['persist'] },
  );
  const names = sel.plugins.map((p) => p.export);
  assert.deepEqual(names.sort(), ['applyElements', 'applyState', 'httpGet', 'on', 'persist', 'signals', 'text'].sort());
  assert.equal(sel.reasons.applyElements, 'httpGet');
  assert.equal(sel.reasons.persist, 'always');
  assert.equal(sel.reasons.text, 'used');
  assert.ok(sel.unused.includes('bind'));
  const boosted = selectPlugins(['<body data-boost>']);
  assert.deepEqual(
    boosted.plugins.map((p) => p.export).sort(),
    ['applyElements', 'applyState', 'boost', 'httpGet', 'httpPost'].sort(),
  );
});

test('custom plugins are read from source and selected only when used', () => {
  const src = `import { attribute, handler } from 'sigmx'
export const upper = attribute({ name: 'upper', value: 'required', returns: true, args: ['extra'], mount() {} })
export const toast = handler({ name: 'toast', handle() {} })`;
  const upper = customPluginMeta('upper', src, '/src/plugins.ts');
  assert.deepEqual([upper.name, upper.type, upper.returns, upper.args], ['upper', 'attribute', true, ['extra']]);
  const toast = customPluginMeta('toast', src, '/src/plugins.ts');
  assert.equal(toast.type, 'handler');
  const used = selectPlugins(['<p data-upper="$x"></p>', "stream.send({ event: 'sigmx-toast' })"], {
    custom: [upper, toast],
  });
  assert.deepEqual(
    used.plugins.map((p) => p.export),
    ['upper', 'toast'],
  );
  const unused = selectPlugins(['<p data-text="$x"></p>'], { custom: [upper, toast] });
  assert.deepEqual(
    unused.unused.filter((n) => ['upper', 'toast'].includes(n)),
    ['upper', 'toast'],
  );
  const mod = generatePluginsModule(used);
  assert.match(mod, /import \{ upper, toast \} from "\/src\/plugins.ts"/);
  assert.match(mod, /export const plugins = \[upper, toast\]/);
});

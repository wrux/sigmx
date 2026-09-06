import assert from 'node:assert/strict';
import { test } from 'node:test';
import sigmx, { bootScript } from '../dist/index.js';

const run = (options) => {
  const injected = [];
  const updates = [];
  sigmx(options).hooks['astro:config:setup']({
    injectScript: (stage, src) => injected.push({ stage, src }),
    updateConfig: (c) => updates.push(c),
    config: { root: 'file:///tmp/site/' },
  });
  return { injected, updates };
};

test('defaults inject the boot script on every page and add no vite plugins', () => {
  const { injected, updates } = run();
  assert.equal(injected.length, 1);
  assert.equal(injected[0].stage, 'page');
  assert.match(injected[0].src, /presets\/all/);
  assert.equal(updates.length, 0);
});

test('auto mode and precompile register vite plugins rooted at the project', () => {
  const { injected, updates } = run({ plugins: 'auto', precompile: true, prefix: 'hx-' });
  assert.equal(updates.length, 1);
  const plugins = updates[0].vite.plugins;
  assert.equal(plugins.length, 2);
  for (const p of plugins) assert.match(p.name, /sigmx/);
  assert.match(injected[0].src, /virtual:sigmx-plugins/);
  assert.match(injected[0].src, /virtual:sigmx-expressions/);
  assert.match(injected[0].src, /"hx-"/);
});

test('inject: false injects nothing; entrypoint injects an import instead', () => {
  assert.equal(run({ inject: false }).injected.length, 0);
  const { injected } = run({ entrypoint: '/src/sigmx.ts' });
  assert.equal(injected[0].src, 'import "/src/sigmx.ts";');
});

test('bootScript variants: plugin lists, expose, precompile fallback', () => {
  assert.match(bootScript({ plugins: ['text', 'on'] }), /import \{ text, on \} from 'sigmx\/plugins'/);
  assert.match(bootScript({ expose: 'app' }), /window\["app"\] = app/);
  assert.doesNotMatch(bootScript({ expose: false }), /window\[/);
  assert.match(bootScript({ precompile: true }), /precompiled\(table, runtimeExpressions\(functionCompiler\)\)/);
  assert.match(bootScript({ precompile: { fallback: false } }), /precompiled\(table, undefined\)/);
  assert.match(bootScript({ eventPrefix: ['sigmx-', 'legacy-'] }), /"eventPrefix":\["sigmx-","legacy-"\]/);
});

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

test('every plugin source file has a DOM test file of the same name', () => {
  const missing = [];
  for (const dir of ['directives', 'functions', 'server-events']) {
    for (const f of readdirSync(`src/plugins/${dir}`)) {
      const name = f.replace(/\.ts$/, '');
      if (!existsSync(`tests/dom/${dir}/${name}.test.mjs`)) missing.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(missing, [], 'plugins without a test file');
});

// Pins the feature set of the current build: every probe in probes.mjs must pass unless it is
// flagged `removed`, and every `removed` probe must fail. Restoring a feature (or losing one by
// accident) therefore fails here until the flag is updated, which keeps the CHANGELOG honest.
// `node tests/audit/run.mjs` prints the same probes as a before/after matrix against a baseline build.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import '../dom/setup.mjs';
import { native } from '../dom/setup.mjs';
import { harness, loadBuild, probes } from './probes.mjs';

const build = await loadBuild(resolve(import.meta.dirname, '../../dist'));

for (const p of probes) {
  test(`${p.removed ? 'removed' : 'kept'}: ${p.group} · ${p.name}`, async () => {
    const h = harness(build, native);
    let error;
    try {
      await p.run(h);
    } catch (e) {
      error = e;
    } finally {
      h.dispose();
    }
    if (p.removed) assert.ok(error, 'flagged as removed but the probe passed: restore the flag or the CHANGELOG');
    else if (error) throw error;
  });
}

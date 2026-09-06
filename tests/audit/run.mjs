// Feature audit: run every probe against a baseline build and the current build, print the
// before/after matrix, and optionally write it as Markdown.
//
//   node tests/audit/run.mjs                       baseline = `main`, built into .audit-baseline/
//   node tests/audit/run.mjs --ref v0.1.1          baseline = another git ref
//   node tests/audit/run.mjs --baseline <dist dir> baseline = an already built dist directory
//   node tests/audit/run.mjs --md report.md        also write the matrix to a Markdown file
//
// The baseline worktree is created with `git worktree add` and built with the repo's own
// build script; delete .audit-baseline/ (and `git worktree prune`) to rebuild it.

import { execSync } from 'node:child_process';
import { existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../dom/setup.mjs';
import { native } from '../dom/setup.mjs';
import { harness, loadBuild, probes } from './probes.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const root = resolve(import.meta.dirname, '../..');

const baselineDist = () => {
  if (arg('--baseline')) return resolve(arg('--baseline'));
  const ref = arg('--ref') ?? 'main';
  const dir = resolve(root, '.audit-baseline');
  if (!existsSync(dir)) {
    execSync(`git worktree add --detach ${JSON.stringify(dir)} ${ref}`, { cwd: root, stdio: 'inherit' });
    symlinkSync(resolve(root, 'node_modules'), resolve(dir, 'node_modules'));
    execSync('node scripts/build.mjs', { cwd: dir, stdio: 'inherit' });
  }
  return resolve(dir, 'dist');
};

const runAll = async (build) => {
  const out = new Map();
  for (const p of probes) {
    const h = harness(build, native);
    try {
      await p.run(h);
      out.set(p, { ok: true });
    } catch (e) {
      out.set(p, { ok: false, error: String(e?.message ?? e).split('\n')[0] });
    } finally {
      h.dispose();
    }
  }
  return out;
};

const before = await loadBuild(baselineDist());
const after = await loadBuild(resolve(root, 'dist'));
const b = await runAll(before);
const a = await runAll(after);

const mark = (r) => (r.ok ? 'pass' : 'FAIL');
const rows = probes.map((p) => ({
  group: p.group,
  name: p.name,
  before: b.get(p),
  after: a.get(p),
  expectedGone: p.removed,
}));
const kept = rows.filter((r) => r.before.ok && r.after.ok).length;
const lost = rows.filter((r) => r.before.ok && !r.after.ok);
const gained = rows.filter((r) => !r.before.ok && r.after.ok);
const neither = rows.filter((r) => !r.before.ok && !r.after.ok);
const surprises = rows.filter((r) => r.expectedGone !== (r.before.ok && !r.after.ok));

let group = '';
const lines = [];
for (const r of rows) {
  if (r.group !== group) {
    group = r.group;
    lines.push(`\n[${group}]`);
  }
  const flag = r.expectedGone ? ' (removed on purpose)' : '';
  lines.push(`  ${mark(r.before).padEnd(4)} → ${mark(r.after).padEnd(4)}  ${r.name}${flag}`);
  if (!r.before.ok) lines.push(`             before: ${r.before.error}`);
  if (!r.after.ok && !r.expectedGone) lines.push(`             after:  ${r.after.error}`);
}
console.log(lines.join('\n'));
console.log(
  `\n${rows.length} probes: ${kept} pass on both builds, ${lost.length} lost (pass before, fail after), ${gained.length} gained, ${neither.length} fail on both.`,
);
if (surprises.length) {
  console.log('\nMismatch between the recorded `removed` flags and the measured result:');
  for (const r of surprises)
    console.log(`  ${r.name}: before ${mark(r.before)}, after ${mark(r.after)}, flagged removed=${r.expectedGone}`);
}

if (arg('--md')) {
  const md = [
    `# Feature audit: ${before.dir} → ${after.dir}`,
    '',
    `${rows.length} probes. **${kept} kept**, **${lost.length} lost**, ${gained.length} gained, ${neither.length} failing on both.`,
    '',
    '| group | feature | before | after |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.group} | ${r.name} | ${mark(r.before)} | ${mark(r.after)} |`),
  ];
  writeFileSync(arg('--md'), `${md.join('\n')}\n`);
}
process.exitCode = surprises.length ? 1 : 0;

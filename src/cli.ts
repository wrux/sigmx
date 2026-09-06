#!/usr/bin/env node
// `sigmx scan [dirs...] [--out file] [--always a,b] [--custom name=path,...] [--prefix data-,hx-]`
import { writeFileSync } from 'node:fs';
import { generatePluginsModule } from './kernel/scan.js';
import { scanProject } from './vite.js';

const args = process.argv.slice(2);
const cmd = args.shift();
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
if (cmd !== 'scan') {
  console.log(
    'usage: sigmx scan [dirs...] [--out src/sigmx-plugins.js] [--always signals,httpGet] [--custom upper=src/plugins/upper.ts] [--prefix data-,hx-]',
  );
  process.exit(cmd ? 1 : 0);
}
const out = opt('out');
const always = opt('always')?.split(',').filter(Boolean);
const prefixes = opt('prefix')?.split(',').filter(Boolean);
const custom = Object.fromEntries((opt('custom')?.split(',') ?? []).map((pair) => pair.split('=') as [string, string]));
const sel = scanProject({ include: args.length ? args : undefined, always, prefixes, custom });
const code = generatePluginsModule(sel);
if (out) {
  writeFileSync(out, code);
  console.log(`wrote ${out}: ${sel.plugins.length} plugins, ${sel.unused.length} unused`);
} else process.stdout.write(code);
for (const [exp, why] of Object.entries(sel.reasons)) console.error(`  ${exp.padEnd(16)} ${why}`);

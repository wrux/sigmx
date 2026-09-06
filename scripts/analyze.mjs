import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';

const cases = {
  core: `import { createSigmx } from './kernel'; createSigmx()`,
  all: `import { sigmx } from './standalone'; console.log(sigmx)`,
};
for (const [name, contents] of Object.entries(cases)) {
  const r = await esbuild.build({
    stdin: { contents, resolveDir: 'src', loader: 'ts' },
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    write: false,
    mangleProps: /^_/,
    metafile: true,
    logLevel: 'silent',
  });
  const out = r.outputFiles[0];
  const meta = Object.values(r.metafile.outputs)[0];
  console.log(`\n== ${name}: ${out.contents.length} B min, ${gzipSync(out.contents, { level: 9 }).length} B gzip`);
  const rows = Object.entries(meta.inputs)
    .map(([f, i]) => [f.replace('src/', ''), i.bytesInOutput])
    .sort((a, b) => b[1] - a[1]);
  for (const [f, b] of rows) console.log(String(b).padStart(6), f);
  if (name === 'core') {
    const fs = await import('node:fs');
    fs.writeFileSync(
      '/private/tmp/claude-502/-Users-callum-Development-test-datastar-port/5056db6e-9deb-4f2b-9a19-8faa956ef6b9/scratchpad/core.min.js',
      out.contents,
    );
  }
}

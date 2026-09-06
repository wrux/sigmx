// Stands in for `@bruits/satteri-wasm32-wasi` in the Workers bundle.
//
// satteri (Astro's markdown compiler) resolves its `#binding` import to a browser build under the
// `browser` condition the Cloudflare adapter uses, and that build re-exports a wasm package which
// is never installed. Markdown is compiled at build time in Node with the native binding, and no
// on-demand route compiles markdown, so the worker never calls into this. The export list is read
// from satteri's own browser binding so it cannot drift from the installed version.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WASM = '@bruits/satteri-wasm32-wasi';
const STUB = '\0satteri-wasm-stub';
const binding = fileURLToPath(new URL('../node_modules/satteri/dist/binding.browser.js', import.meta.url));

export const satteriWasmStub = () => ({
  name: 'sigmx:satteri-wasm-stub',
  resolveId: (id) => (id === WASM ? STUB : undefined),
  load(id) {
    if (id !== STUB) return;
    const names = readFileSync(binding, 'utf8')
      .match(/export\s*\{([^}]*)\}/)?.[1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names?.length) throw new Error(`could not read satteri's browser binding exports from ${binding}`);
    const boom = `() => { throw new Error('satteri is not available in the Workers bundle; markdown is compiled at build time') }`;
    return names.map((n) => `export const ${n} = ${boom};`).join('\n');
  },
});

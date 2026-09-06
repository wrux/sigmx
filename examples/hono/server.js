import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { events, patchElements, patchSignals, stream } from './lib/sse.js';

const here = dirname(fileURLToPath(import.meta.url));
const page = await readFile(join(here, 'index.html'), 'utf8');
// The script-tag build of sigmx, read once from node_modules: no bundler anywhere in this example.
const sigmxDist = join(dirname(fileURLToPath(import.meta.resolve('sigmx/package.json'))), 'dist');
const standalone = await readFile(join(sigmxDist, 'sigmx.standalone.js'));

const app = new Hono();
app.get('/', (c) => c.html(page));
app.get('/sigmx.js', (c) => c.body(standalone, 200, { 'content-type': 'text/javascript; charset=utf-8' }));

/** GET requests carry the signals as JSON in the `sigmx` query parameter; POST/PUT carry them in the body. */
const signals = (c) => (c.req.method === 'GET' ? JSON.parse(c.req.query('sigmx') ?? '{}') : c.req.json());

const towns = ['Bath', 'Bristol', 'Cardiff', 'Exeter', 'Oxford'];
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// Plain HTML: the client morphs it over the element with the same id.
app.post('/api/greet', async (c) => {
  const { name = '' } = await signals(c);
  return c.html(
    `<p id="greeting" class="text-sm text-teal-700 dark:text-teal-300">Hello ${esc(name || 'stranger')}, from Hono at ${new Date().toLocaleTimeString()}.</p>`,
  );
});

// Two events in one response: the fresh list, then a signal reset that fades the results back in.
app.get('/api/towns', (c) => {
  const { q = '' } = signals(c);
  const matches = towns.filter((t) => t.toLowerCase().includes(String(q).toLowerCase()));
  const items =
    matches.map((t) => `<li class="py-1.5">${t}</li>`).join('') ||
    '<li class="py-1.5 text-zinc-500">No towns match.</li>';
  return events(
    patchElements(
      `<ul id="towns" class="divide-y divide-zinc-200 transition-opacity duration-200 dark:divide-zinc-800" data-class="{ 'opacity-40': $stale }">${items}</ul>`,
    ),
    patchSignals({ stale: false }),
  );
});

// A form posted as application/x-www-form-urlencoded; Hono parses it, the reply is HTML.
app.post('/api/subscribe', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? '').trim();
  if (!email.includes('@'))
    return c.html(
      `<div id="subscribe" class="text-sm text-rose-600 dark:text-rose-400">That does not look like an email address.</div>`,
    );
  return c.html(
    `<div id="subscribe" class="text-sm text-teal-700 dark:text-teal-300">Thanks, ${esc(email)} is on the list.</div>`,
  );
});

// A stream that keeps delivering until the work is done or the client disconnects.
app.get('/api/progress', () =>
  stream(async (send, open) => {
    send(patchSignals({ running: true, progress: 0 }));
    for (let step = 1; step <= 10 && open(); step++) {
      await new Promise((r) => setTimeout(r, 150));
      send(patchSignals({ progress: step * 10 }));
    }
    send(patchSignals({ running: false }));
  }),
);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => console.log(`sigmx + Hono on http://localhost:${port}`));

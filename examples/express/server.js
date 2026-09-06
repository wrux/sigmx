import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openStream, patchElements, patchSignals, sendEvents } from './lib/sse.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// The script-tag build of sigmx, straight from node_modules: no bundler anywhere in this example.
const sigmxDist = join(dirname(fileURLToPath(import.meta.resolve('sigmx/package.json'))), 'dist');
app.use('/vendor/sigmx', express.static(sigmxDist));

app.get('/', (_req, res) => res.sendFile(join(here, 'index.html')));

/** GET requests carry the signals as JSON in the `sigmx` query parameter; POST/PUT carry them in the body. */
const signals = (req) => (req.method === 'GET' ? JSON.parse(req.query.sigmx ?? '{}') : req.body);

const towns = ['Bath', 'Bristol', 'Cardiff', 'Exeter', 'Oxford'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Plain HTML: the client morphs it over the element with the same id.
app.post('/api/greet', (req, res) => {
  const { name = '' } = signals(req);
  res.send(
    `<p id="greeting" class="text-sm text-teal-700 dark:text-teal-300">Hello ${esc(name || 'stranger')}, from Express at ${new Date().toLocaleTimeString()}.</p>`,
  );
});

// Two events in one response: the fresh list, then a signal reset that fades the results back in.
app.get('/api/towns', (req, res) => {
  const { q = '' } = signals(req);
  const matches = towns.filter((t) => t.toLowerCase().includes(String(q).toLowerCase()));
  const items =
    matches.map((t) => `<li class="py-1.5">${t}</li>`).join('') ||
    '<li class="py-1.5 text-zinc-500">No towns match.</li>';
  sendEvents(
    res,
    patchElements(
      `<ul id="towns" class="divide-y divide-zinc-200 transition-opacity duration-200 dark:divide-zinc-800" data-class="{ 'opacity-40': $stale }">${items}</ul>`,
    ),
    patchSignals({ stale: false }),
  );
});

// A form posted as application/x-www-form-urlencoded; Express parses it, the reply is HTML.
app.post('/api/subscribe', (req, res) => {
  const email = String(req.body.email ?? '').trim();
  if (!email.includes('@'))
    return res.send(
      `<div id="subscribe" class="text-sm text-rose-600 dark:text-rose-400">That does not look like an email address.</div>`,
    );
  res.send(
    `<div id="subscribe" class="text-sm text-teal-700 dark:text-teal-300">Thanks, ${esc(email)} is on the list.</div>`,
  );
});

// A stream that keeps delivering until the work is done or the client disconnects.
app.get('/api/progress', async (req, res) => {
  const stream = openStream(req, res);
  stream.send(patchSignals({ running: true, progress: 0 }));
  for (let step = 1; step <= 10 && stream.open; step++) {
    await new Promise((r) => setTimeout(r, 150));
    stream.send(patchSignals({ progress: step * 10 }));
  }
  stream.send(patchSignals({ running: false }));
  stream.end();
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`sigmx + Express on http://localhost:${port}`));

import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { formatEvent, patchElements, patchSignals, SSE_HEADERS, sseStream } from 'sigmx/server';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// public/sigmx.js is the client bundle written by `vite build` (see vite.config.js): auto mode scans
// index.html and this file and ships only the plugins they use, a fraction of the every-plugin build.
app.use(express.static(join(here, 'public'), { immutable: false, maxAge: '1h' }));

app.get('/', (_req, res) => res.sendFile(join(here, 'index.html')));

// `sigmx/server` speaks Web Request/Response; these two lines bridge to Express's res.
const events = (res, ...list) => res.set(SSE_HEADERS).send(list.map(formatEvent).join(''));
const pipe = (res, response) =>
  pipeline(Readable.fromWeb(response.body), res.set(Object.fromEntries(response.headers))).catch(() => {});

/** GET requests carry the signals as JSON in the `sigmx` query parameter; POST/PUT carry them in the body. */
const signals = (req) => (req.method === 'GET' ? JSON.parse(req.query.sigmx ?? '{}') : req.body);

const towns = ['Bath', 'Bristol', 'Cardiff', 'Exeter', 'Oxford'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
  events(
    res,
    patchElements(
      `<ul id="towns" class="divide-y divide-zinc-200 transition-opacity duration-200 dark:divide-zinc-800" data-class="{ 'opacity-40': $stale }">${items}</ul>`,
    ),
    patchSignals({ stale: false }),
  );
});

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

app.get('/api/progress', (_req, res) =>
  pipe(
    res,
    sseStream(async (s) => {
      s.patchSignals({ running: true, progress: 0 });
      for (let step = 1; step <= 10 && !s.closed; step++) {
        await new Promise((r) => setTimeout(r, 150));
        s.patchSignals({ progress: step * 10 });
      }
      s.patchSignals({ running: false });
    }),
  ),
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`sigmx + Express on http://localhost:${port}`));

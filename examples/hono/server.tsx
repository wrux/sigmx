import { serve } from '@hono/node-server';
import { patchElements, patchSignals, sigmx } from '@sigmx/hono';
import { serveClient } from '@sigmx/hono/node';
import { Hono } from 'hono';
import { jsxRenderer } from 'hono/jsx-renderer';
import { Greeting, Home, Layout, Subscribed, Towns } from './components.js';

const app = new Hono();
app.use(sigmx()); // every handler now has c.var.sigmx
app.get('/sigmx.js', serveClient()); // the script-tag build straight from node_modules, no bundler

app.use(
  '/',
  jsxRenderer(({ children }) => <Layout title="sigmx + Hono">{children}</Layout>, { docType: true }),
);
app.get('/', (c) => c.render(<Home />));

app.post('/api/greet', async (c) => {
  const { name = '' } = await c.var.sigmx.signals();
  return c.html(<Greeting name={String(name)} />);
});

// Two events in one response: the fresh list, then a signal reset that fades the results back in.
app.get('/api/towns', async (c) => {
  const { q = '' } = await c.var.sigmx.signals();
  return c.var.sigmx.events(patchElements(<Towns q={String(q)} />), patchSignals({ stale: false }));
});

app.post('/api/subscribe', async (c) => {
  const { email = '' } = await c.var.sigmx.signals();
  return c.html(<Subscribed email={String(email)} ok={String(email).includes('@')} />);
});

app.get('/api/progress', (c) =>
  c.var.sigmx.stream(async (s) => {
    await s.patchSignals({ running: true, progress: 0 });
    for (let step = 1; step <= 10 && !s.closed; step++) {
      await s.sleep(150);
      await s.patchSignals({ progress: step * 10 });
    }
    await s.patchSignals({ running: false });
  }),
);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => console.log(`sigmx + Hono on http://localhost:${port}`));

import { sseStream } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';

export const prerender = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One request, many patches: an event stream of signal updates.
export const GET: APIRoute = () =>
  sseStream(async (s) => {
    s.patchSignals({ running: true, progress: 0 });
    for (let p = 20; p <= 100; p += 20) {
      await sleep(300);
      s.patchSignals({ progress: p });
    }
    s.patchSignals({ running: false });
  });

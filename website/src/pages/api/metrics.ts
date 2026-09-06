import { sseStream } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';

export const prerender = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const drift = (v: number, min: number, max: number, step: number) =>
  Math.min(max, Math.max(min, v + (Math.random() - 0.5) * step));

export const GET: APIRoute = ({ request }) => {
  const lastId = Number(request.headers.get('last-event-id') ?? 0);
  let cpu = 35,
    mem = 62,
    rps = 240,
    errors = 0.4;
  return sseStream(async (s) => {
    for (let tick = lastId + 1; tick < lastId + 400 && !s.closed; tick++) {
      cpu = drift(cpu, 5, 100, 30);
      mem = drift(mem, 30, 95, 6);
      rps = drift(rps, 50, 900, 120);
      errors = drift(errors, 0, 8, 1.2);
      s.patchSignals(
        {
          metrics: {
            cpu: Math.round(cpu),
            mem: Math.round(mem),
            rps: Math.round(rps),
            errors: Math.round(errors * 10) / 10,
          },
          tick,
          updatedAt: Date.now(),
        },
        { id: String(tick) },
      );
      await sleep(800);
    }
  });
};

import { sseStream } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';

export const prerender = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toasts = [
  { message: 'Export queued', tone: 'info' },
  { message: 'Rendering 3 pages…', tone: 'info' },
  { message: 'Export finished', tone: 'good' },
];

/** Streams three `sigmx-toast` events; the client's `toast` handler shows each one. */
export const GET: APIRoute = () =>
  sseStream(async (s) => {
    for (const [i, t] of toasts.entries()) {
      if (i) await sleep(900);
      s.send({ event: 'sigmx-toast', lines: [`message ${t.message}`, `tone ${t.tone}`] });
    }
  });

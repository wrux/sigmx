import { readSignals, sseStream } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * "Places an order": patches the page and then records the goal in the same stream, so the
 * `Purchase` event is only ever sent once the server has actually done the work.
 */
export const POST: APIRoute = async ({ request }) => {
  const { qty = 1 } = await readSignals(request);
  const total = Number(qty) * 12;
  return sseStream((s) => {
    s.patchSignals({ ordered: true, total });
    s.send({ event: 'sigmx-track', lines: ['name Purchase', `props ${JSON.stringify({ total, qty })}`] });
  });
};

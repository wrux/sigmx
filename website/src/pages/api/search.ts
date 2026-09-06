import { patchElements, patchSignals, readSignals, sse } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Towns from '../../components/partials/Towns.astro';
import { towns } from '../../data/towns';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const { q = '' } = await readSignals(request);
  const matches = towns.filter((t) => t.toLowerCase().includes(String(q).toLowerCase()));
  const container = await AstroContainer.create();
  const list = await container.renderToString(Towns, { props: { q, towns: matches } });
  return sse(patchElements(list), patchSignals({ results: matches.length }));
};

import { patchElements, patchSignals, readSignals, sse } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';

export const prerender = false;
const towns = ['Bath', 'Bristol', 'Cardiff', 'Exeter', 'Oxford'];

// Two events in one response: morph the new list over <ul id="towns">, then reset the
// `stale` signal the page set when typing began so the results fade back in.
export const GET: APIRoute = async ({ request }) => {
  const { q = '' } = await readSignals(request);
  const matches = towns.filter((t) => t.toLowerCase().includes(String(q).toLowerCase()));
  const list = `<ul id="towns" class="divide-y divide-zinc-200 transition-opacity duration-200 dark:divide-zinc-800" data-class="{ 'opacity-40': $stale }">${matches.map((t) => `<li class="py-1.5">${t}</li>`).join('') || '<li class="py-1.5 text-zinc-500">No towns match.</li>'}</ul>`;
  return sse(patchElements(list), patchSignals({ stale: false }));
};

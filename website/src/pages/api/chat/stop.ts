import { json, readSignals } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';
import { stopped } from './index';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const { chatId } = await readSignals(request);
  stopped.add(String(chatId));
  return json({ thinking: false });
};

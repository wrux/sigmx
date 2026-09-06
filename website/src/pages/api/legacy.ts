import type { APIRoute } from 'astro';

export const prerender = false;
// A response written the way a Datastar backend would write it: accepted because the site's
// instance is configured with eventPrefix: ['sigmx-', 'datastar-'].
export const GET: APIRoute = () =>
  new Response('event: datastar-patch-signals\ndata: signals {"legacy": "accepted"}\n\n', {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });

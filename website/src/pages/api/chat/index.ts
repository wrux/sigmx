import { readSignals, sseStream } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Message from '../../../components/examples/chat/Message.astro';

export const prerender = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const stopped = new Set<string>();

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const think = (prompt: string): { reply: string; tool?: { name: string; result: string } } => {
  const p = prompt.toLowerCase();
  if (p.includes('time') || p.includes('clock'))
    return {
      tool: { name: 'clock', result: new Date().toLocaleTimeString('en-GB') },
      reply:
        'I checked the clock for you. The server says it is that time right now, streamed into a tool card by a custom server event.',
    };
  if (p.includes('weather'))
    return {
      tool: { name: 'weather', result: 'Bristol: 17 °C, light rain, wind 12 km/h' },
      reply:
        'The weather tool answered. Everything you see arrived over one event stream: the tool card, this text, and the typing indicator that flips off at the end.',
    };
  if (p.includes('sigmx') || p.includes('how'))
    return {
      reply:
        'This chat is one form and one endpoint. Your message is appended by the server, then an empty assistant bubble is appended, and each word I produce morphs that bubble by id. The Stop button posts to a second endpoint that flips a flag the stream checks between words.',
    };
  if (p.includes('size') || p.includes('bundle'))
    return {
      reply:
        'The minimal build is about 5 KB gzipped, everything with the streaming client and morph is about 12.6 KB, and there are no runtime dependencies. Every number on the bundle-sizes page is measured from the real source.',
    };
  return {
    reply: `You said “${prompt}”. I am a canned demo agent with no model behind me, but the plumbing is real: a streamed response, a morphed bubble, a typing indicator, a stop flag, tool cards, and a persisted draft. Try asking about the time, the weather, or bundle sizes.`,
  };
};

export const POST: APIRoute = async ({ request }) => {
  const { draft = '', chatId = '', turn = 0 } = await readSignals(request);
  const text = String(draft).trim();
  const container = await AstroContainer.create();
  const render = (props: Record<string, unknown>) => container.renderToString(Message, { props });
  return sseStream(async (s) => {
    if (!text) return;
    stopped.delete(chatId);
    const n = Number(turn) * 2;
    s.patchElements(await render({ id: `m-${n}`, role: 'user', text }), { selector: '#chat-log', mode: 'append' });
    s.patchSignals({ draft: '', thinking: true, words: 0, turn: Number(turn) + 1 });
    await sleep(300);
    const { reply, tool } = think(text);
    if (tool) {
      await sleep(400);
      s.send({ event: 'sigmx-tool', lines: [`name ${tool.name}`, `result ${tool.result}`, `after m-${n}`] });
      await sleep(400);
    }
    s.patchElements(await render({ id: `m-${n + 1}`, role: 'assistant', text: '' }), {
      selector: '#chat-log',
      mode: 'append',
    });
    const words = reply.split(' ');
    let out = '';
    for (const [i, w] of words.entries()) {
      if (stopped.has(chatId) || s.closed) break;
      out += (i ? ' ' : '') + w;
      // Idempotent: the whole bubble is re-sent and morphed, so a dropped event is harmless.
      s.patchElements(`<p id="m-${n + 1}-text">${esc(out)}</p>`);
      s.patchSignals({ words: i + 1 });
      await sleep(45 + Math.random() * 60);
    }
    if (stopped.has(chatId)) s.patchElements(`<p id="m-${n + 1}-text">${esc(out)} <i>(stopped)</i></p>`);
    s.patchSignals({ thinking: false });
  });
};

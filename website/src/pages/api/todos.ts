import { html, patchElements, patchSignals, readSignals, sse } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import TodoList from '../../components/partials/TodoList.astro';
import { addTodo, removeTodo, todos } from '../../data/todos';

export const prerender = false;
const render = async () => (await AstroContainer.create()).renderToString(TodoList, { props: { todos } });

export const GET: APIRoute = async () => html(await render());

export const POST: APIRoute = async ({ request }) => {
  const { newTodo = '' } = await readSignals(request);
  const text = String(newTodo).trim();
  if (text) addTodo(text);
  // One response, two effects: morph the list and clear the input's signal.
  return sse(patchElements(await render()), patchSignals({ newTodo: '' }));
};

export const DELETE: APIRoute = async ({ url }) => {
  removeTodo(Number(url.searchParams.get('id')));
  return html(await render());
};

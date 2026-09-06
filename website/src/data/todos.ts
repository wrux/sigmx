export type Todo = { id: number; text: string };
let next = 3;
export const todos: Todo[] = [
  { id: 1, text: 'Read the sigmx docs' },
  { id: 2, text: 'Ship something' },
];
export const addTodo = (text: string): Todo => {
  const t = { id: next++, text };
  todos.push(t);
  return t;
};
export const removeTodo = (id: number) => {
  const i = todos.findIndex((t) => t.id === id);
  if (i >= 0) todos.splice(i, 1);
};

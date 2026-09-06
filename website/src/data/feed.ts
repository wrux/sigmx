const authors = ['ada', 'grace', 'linus', 'margaret', 'dennis', 'barbara'];
const verbs = ['shipped', 'reviewed', 'sketched', 'benchmarked', 'refactored', 'documented'];
const things = [
  'the morph algorithm',
  'a streaming endpoint',
  'the checkout wizard',
  'signal batching',
  'the Astro SDK',
  'a data table',
  'the docs sidebar',
];
export const PAGE_SIZE = 6;
export const TOTAL = 30;
export const post = (n: number) => ({
  id: n,
  author: authors[n % authors.length],
  text: `${verbs[(n * 7) % verbs.length]} ${things[(n * 11) % things.length]}`,
  minutesAgo: n * 9 + 3,
});
export const page = (p: number) =>
  Array.from({ length: PAGE_SIZE }, (_, i) => p * PAGE_SIZE + i + 1)
    .filter((n) => n <= TOTAL)
    .map(post);

import { dir } from '../def.js';

/** A boolean signal that is true while a request started from this element (or one inside it) is in flight. */
export const indicator = dir('indicator', 0, ({ el, key, value, cased, store, listen }) => {
  const path = key ? cased() : value.trim();
  // Requests are remembered by id at `started`, because the element that made one may have been
  // morphed away by the time it finishes.
  const mine = new Set<number>();
  store.set(path, false);
  listen(document, 'sigmx-fetch', (e: CustomEvent<{ el: Element; type: string; rid: number }>) => {
    const { el: from, type, rid } = e.detail;
    if (type === 'started' && el.contains(from)) mine.add(rid);
    else if (type === 'finished') mine.delete(rid);
    else return;
    store.set(path, mine.size > 0);
  });
  return () => store.set(path, false);
});

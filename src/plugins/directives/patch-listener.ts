import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

const touches = (patch: Record<string, any>, path: string): boolean => {
  let cur: any = patch;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(k in cur)) return false;
    cur = cur[k];
  }
  return true;
};

/**
 * Runs after signals change, with the patch as `patch`. A key narrows it to one path:
 * `on-signal-patch:user.name="..."`.
 */
export const onSignalPatch = dir(
  'on-signal-patch',
  20,
  ({ key, cased, mods, evaluate, listen }) => {
    const path = key ? cased() : '';
    let running = false;
    const run = withTiming((patch: Record<string, any>) => {
      if (running) return;
      running = true;
      try {
        evaluate(undefined, patch);
      } finally {
        running = false;
      }
    }, mods);
    listen(document, 'sigmx-signal-patch', (e: CustomEvent) => {
      if (!path || touches(e.detail, path)) run(e.detail);
    });
  },
  ['patch'],
);

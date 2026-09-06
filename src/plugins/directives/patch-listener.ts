import { withTiming } from '../../kernel/index.js';
import { dir } from '../def.js';

/**
 * Runs after signals change, with the patch as `patch`. A key narrows it to one path:
 * `on-signal-patch:user.name="..."`.
 */
export const onSignalPatch = dir(
  'on-signal-patch',
  22,
  ({ mods, evaluate, listen }) => {
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
    listen(document, 'sigmx-signal-patch', (e: CustomEvent) => run(e.detail));
  },
  ['patch'],
);

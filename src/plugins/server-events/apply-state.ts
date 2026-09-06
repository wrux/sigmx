import { handler } from '../../kernel/index.js';

/** Server event `patch-signals`: `signals {json}` merged into the store; `onlyIfMissing true` keeps existing values. */
export const applyState = handler({
  name: 'patch-signals',
  handle(runtime, { signals, onlyIfMissing }) {
    if (!signals) return;
    let patch: Record<string, unknown>;
    try {
      patch = JSON.parse(signals);
    } catch {
      patch = runtime.compiler([], `return (${signals})`)();
    }
    runtime.store.merge(patch, { ifMissing: onlyIfMissing === 'true' });
  },
});

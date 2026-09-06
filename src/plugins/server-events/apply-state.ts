import { srv } from '../def.js';

/** Server event `patch-signals`: `signals {json}` merged into the store; `onlyIfMissing true` keeps existing values. */
export const applyState = srv('patch-signals', (runtime, { signals, onlyIfMissing }) => {
  if (!signals) return;
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(signals);
  } catch {
    patch = runtime.compiler([], `return (${signals})`)();
  }
  runtime.store.merge(patch, { ifMissing: onlyIfMissing === 'true' });
});

import { createSigmx } from './kernel/index.js';
import { all } from './presets/all.js';

export const sigmx = createSigmx({ plugins: all });
(globalThis as any).sigmx = sigmx;

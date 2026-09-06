import { dir } from '../def.js';

export const effect = dir('effect', 22, (ctx) => ctx.effect(() => ctx.evaluate()));

import { act } from '../def.js';

/** Map `v` from [inMin, inMax] onto [outMin, outMax]; optionally clamp and round. */
export const fit = act(
  'fit',
  (_, v: number, inMin: number, inMax: number, outMin: number, outMax: number, clamp = false, round = false) => {
    let t = inMax === inMin ? 0 : (v - inMin) / (inMax - inMin);
    if (clamp) t = Math.min(1, Math.max(0, t));
    const out = outMin + t * (outMax - outMin);
    return round ? Math.round(out) : out;
  },
);

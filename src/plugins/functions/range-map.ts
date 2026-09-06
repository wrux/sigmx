import { action } from '../../kernel/index.js';

/** Map `v` from [inMin, inMax] onto [outMin, outMax]; optionally clamp and round. */
export const fit = action({
  name: 'fit',
  call: (_, v: number, inMin: number, inMax: number, outMin: number, outMax: number, clamp = false, round = false) => {
    let t = (v - inMin) / (inMax - inMin);
    if (clamp) t = Math.min(1, Math.max(0, t));
    const out = outMin + t * (outMax - outMin);
    return round ? Math.round(out) : out;
  },
});

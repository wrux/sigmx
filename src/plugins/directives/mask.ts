import { attribute } from '../../kernel/index.js';

const slots: Record<string, RegExp> = { '9': /\d/, a: /[a-zA-Z]/, '*': /[a-zA-Z0-9]/ };

/** Format raw input against a mask: `9` digit, `a` letter, `*` either, anything else literal. */
export const applyMask = (mask: string, raw: string): string => {
  let out = '';
  let i = 0;
  for (const m of mask) {
    if (i >= raw.length) break;
    const slot = slots[m];
    if (slot) {
      while (i < raw.length && !slot.test(raw[i])) i++;
      if (i >= raw.length) break;
      out += raw[i++];
    } else {
      out += m;
      if (raw[i] === m) i++;
    }
  }
  return out;
};

/**
 * Formats the input as the user types: `mask="(999) 999-9999"`. The value is the mask itself;
 * add `__dynamic` to evaluate it as an expression instead (`mask__dynamic="$isUS ? '999-999' : '9999'"`).
 */
export const mask = attribute({
  name: 'mask',
  key: 'forbidden',
  value: 'required',
  mount({ el, value, mods, evaluate, listen, effect }) {
    const input = el as HTMLInputElement;
    let pattern = value;
    const format = () => {
      const next = applyMask(pattern, input.value);
      if (next !== input.value) {
        input.value = next;
        input.dispatchEvent(new Event('input', { bubbles: true })); // let `bind` see the formatted value
      }
    };
    listen(input, 'input', format);
    if (mods.has('dynamic')) {
      effect(() => {
        pattern = String(evaluate() ?? '');
        format();
      });
    } else format();
  },
});

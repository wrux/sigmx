import { act } from '../def.js';

/**
 * `@intl('NumberFormat', 1234.5, { style: 'currency', currency: 'EUR' }, 'de')` formats with the named
 * `Intl` API (NumberFormat, DateTimeFormat, PluralRules, RelativeTimeFormat as `[value, unit]`, ListFormat, DisplayNames).
 */
export const intl = act(
  'intl',
  ({ error }, type: string, value: any, options?: Record<string, unknown>, locale?: string | string[]) => {
    const C = (Intl as any)[type];
    if (!C) throw error(`unknown @intl type "${type}"`);
    const f = new C(locale, options);
    return (f.select ?? f.of ?? f.format).call(f, ...(type === 'RelativeTimeFormat' ? value : [value])) ?? '';
  },
);

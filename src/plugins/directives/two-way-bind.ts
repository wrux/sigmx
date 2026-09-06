import { attribute } from '../../kernel/index.js';

type Adapter = { _read(): unknown; _write(v: unknown): void; _events: string[] };
const adapter = (_read: () => unknown, _write: (v: any) => void, ..._events: string[]): Adapter => ({
  _read,
  _write,
  _events,
});

const readFiles = (input: HTMLInputElement) =>
  Promise.all(
    [...(input.files ?? [])].map(
      (f) =>
        new Promise<{ name: string; type: string; size: number; contents: string }>((resolve) => {
          const r = new FileReader();
          r.onloadend = () =>
            resolve({ name: f.name, type: f.type, size: f.size, contents: String(r.result).split(',')[1] ?? '' });
          r.readAsDataURL(f);
        }),
    ),
  );

/**
 * Two-way binding: `bind:name` or `bind="name"`. Creates the signal from the element when missing.
 * Checkbox groups bind to arrays, radios to the checked value, `select multiple` to arrays.
 * `__prop.value` binds a custom element property; `__event.change` picks the events to listen for.
 */
export const bind = attribute({
  name: 'bind',
  mount({ el, key, value, cased, mods, store, listen, effect }) {
    const path = key ? cased() : value.trim();
    const current = () => store.get(path);
    const asNumber = (s: string) => (typeof current() === 'number' ? +s : s);
    let a: Adapter;
    const prop = mods.get('prop')?.[0];

    if (prop) {
      a = adapter(
        () => (el as any)[prop],
        (v) => ((el as any)[prop] = v),
        'input',
        'change',
      );
    } else if (el instanceof HTMLInputElement) {
      const t = el.type;
      if (t === 'checkbox') {
        const own = el.hasAttribute('value') && el.value !== 'on';
        a = {
          _read: () => {
            const cur = current();
            if (Array.isArray(cur)) {
              const set = new Set(cur);
              el.checked ? set.add(el.value) : set.delete(el.value);
              return [...set];
            }
            return own ? (el.checked ? el.value : '') : el.checked;
          },
          _write: (v) => {
            el.checked = Array.isArray(v) ? v.includes(el.value) : own ? v === el.value : !!v;
          },
          _events: ['input'],
        };
      } else if (t === 'radio') {
        if (!el.name) el.name = path;
        a = adapter(
          () => (el.checked ? asNumber(el.value) : current()),
          (v) => (el.checked = String(v) === el.value),
          'input',
        );
      } else if (t === 'file') {
        listen(el, 'change', () => readFiles(el).then((files) => store.set(path, files)));
        return;
      } else if (t === 'number' || t === 'range') {
        a = adapter(
          () => (el.value === '' ? '' : +el.value),
          (v) => (el.value = String(v ?? '')),
          'input',
        );
      } else {
        a = adapter(
          () => el.value,
          (v) => (el.value = String(v ?? '')),
          'input',
        );
      }
    } else if (el instanceof HTMLSelectElement) {
      a = {
        _read: () => (el.multiple ? [...el.selectedOptions].map((o) => asNumber(o.value)) : asNumber(el.value)),
        _write: (v) => {
          if (el.multiple) for (const o of el.options) o.selected = Array.isArray(v) && v.map(String).includes(o.value);
          else el.value = String(v ?? '');
        },
        _events: ['change'],
      };
    } else if (el instanceof HTMLTextAreaElement || 'value' in el) {
      a = adapter(
        () => (el as any).value,
        (v) => ((el as any).value = String(v ?? '')),
        'input',
        'change',
      );
    } else {
      a = adapter(
        () => el.getAttribute('value'),
        (v) => el.setAttribute('value', String(v ?? '')),
        'change',
      );
    }

    if (!store.has(path)) {
      const initial = a._read();
      if (initial !== undefined && initial !== '') store.set(path, initial);
    }
    const sync = () => store.set(path, a._read());
    for (const type of mods.get('event') ?? a._events) listen(el, type, sync);
    listen(el, 'sigmx-prop-change', sync);
    effect(() => {
      const v = current();
      if (v !== undefined) a._write(v);
    });
  },
});

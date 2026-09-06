import { dir } from '../def.js';

type Adapter = { _read(): unknown; _write(v: unknown): void; _events: string[] };

const str = (v: unknown) => String(v ?? '');

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
 * `__event.change` picks the events to listen for.
 */
export const bind = dir('bind', 0, ({ el, key, value, cased, mods, store, listen, effect }) => {
  const path = key ? cased() : value.trim();
  const current = () => store.get(path);
  const asNumber = (s: string) => (typeof current() === 'number' ? +s : s);
  const input = el as HTMLInputElement;
  const type = el instanceof HTMLInputElement ? input.type : '';
  /** Adapter writing `el.value`. */
  const valued = (_read: () => unknown, ..._events: string[]): Adapter => ({
    _read,
    _write: (v) => {
      // A number field mid-entry ('-', '1e') reads as '' with badInput; do not wipe what the user is typing.
      if (str(v) !== input.value && !input.validity?.badInput) input.value = str(v);
    },
    _events,
  });
  let a: Adapter;

  if (type === 'checkbox') {
    const own = el.hasAttribute('value') && input.value !== 'on';
    a = {
      _read: () => {
        const cur = current();
        if (Array.isArray(cur)) {
          const set = new Set(cur);
          input.checked ? set.add(input.value) : set.delete(input.value);
          return [...set];
        }
        return own ? (input.checked ? input.value : '') : input.checked;
      },
      _write: (v) => {
        input.checked = Array.isArray(v) ? v.includes(input.value) : own ? v === input.value : !!v;
      },
      _events: ['input'],
    };
  } else if (type === 'radio') {
    input.name ||= path;
    a = {
      _read: () => (input.checked ? asNumber(input.value) : current()),
      _write: (v) => (input.checked = String(v) === input.value),
      _events: ['input'],
    };
  } else if (type === 'file') {
    listen(el, 'change', () => readFiles(input).then((files) => store.set(path, files)));
    return;
  } else if (type) {
    const numeric = type === 'number' || type === 'range';
    a = valued(() => (numeric && input.value !== '' ? +input.value : input.value), 'input');
  } else if (el instanceof HTMLSelectElement) {
    a = {
      _read: () => (el.multiple ? [...el.selectedOptions].map((o) => asNumber(o.value)) : asNumber(el.value)),
      _write: (v) => {
        if (el.multiple) for (const o of el.options) o.selected = Array.isArray(v) && v.map(String).includes(o.value);
        else el.value = str(v);
      },
      _events: ['change'],
    };
  } else if ('value' in el) {
    a = valued(() => input.value, 'input', 'change');
  } else {
    a = {
      _read: () => el.getAttribute('value'),
      _write: (v) => el.setAttribute('value', str(v)),
      _events: ['change'],
    };
  }

  if (!store.has(path)) {
    const initial = a._read();
    if (initial !== undefined && initial !== '') store.set(path, initial);
  }
  const sync = () => store.set(path, a._read());
  for (const t of [...(mods.get('event') ?? a._events), 'sigmx-prop-change']) listen(el, t, sync);
  effect(() => a._write(current())); // undefined (removed signal) clears the field
});

import { type CaseStyle, recase } from '../lib/casing.js';
import { functionCompiler } from './compile.js';
import type {
  ActionCtx,
  AttributePlugin,
  Ctx,
  El,
  Evaluator,
  Mods,
  Plugin,
  Runtime,
  RuntimeOptions,
  Sigmx,
} from './contracts.js';
import { rootEffect } from './reactive.js';
import { createStore } from './state.js';

const isEl = (n: Node): n is El => n.nodeType === 1;
/** An element (or shadow root) followed by every element under it; nothing for text and comment nodes. */
const tree = (n: Node): El[] =>
  (n as ParentNode).querySelectorAll ? [...(isEl(n) ? [n] : []), ...(n as ParentNode).querySelectorAll<El>('*')] : [];

type Parsed = { plugin: string; key: string | undefined; mods: Mods };

/** 'on:click__debounce.300ms__prevent' → { plugin: 'on', key: 'click', mods: {debounce: ['300ms'], prevent: []} } */
export const parseAttr = (raw: string): Parsed => {
  const [head, ...modParts] = raw.split('__');
  const [, plugin, key] = /^([^:]*)(?::(.*))?$/.exec(head) as string[];
  return {
    plugin,
    key,
    mods: new Map(
      modParts.map((m) => {
        const [name, ...args] = m.split('.');
        return [name, args];
      }),
    ),
  };
};

/** The rest of `s` after the first prefix in `list` that it starts with; undefined when none matches. */
const cut = (list: readonly string[], s: string): string | undefined => {
  for (const p of list) if (s.startsWith(p)) return s.slice(p.length);
};

/** Low-level constructor: you supply the expression pipeline. `createSigmx` wraps it with the runtime compiler. */
export const createRuntime = (options: RuntimeOptions): Sigmx => {
  const prefixes = ([] as string[]).concat(options.prefix ?? 'data-');
  const eventPrefixes = ([] as string[]).concat(options.eventPrefix ?? 'sigmx-');
  const store = options.store ?? createStore();
  const { expressions } = options;
  const onError = options.onError ?? ((e, info) => console.error(e, info));
  const attributes: Record<string, AttributePlugin> = Object.create(null);

  const runtime: Runtime = {
    prefixes,
    attr: (name) => prefixes[0] + name,
    store,
    compiler: options.compile ?? functionCompiler,
    emit: (type, detail) => document.dispatchEvent(new CustomEvent(`sigmx-${type}`, { detail })),
    call: (name, ctx, args) => {
      const a = runtime.actions[name];
      if (!a) throw ctx.error(`unknown action @${name}`);
      return a.call(ctx, ...args);
    },
    eventPrefixes,
    handle: (event, data) => {
      const h = runtime.handlers[cut(eventPrefixes, event) ?? event];
      h?.handle(runtime, data);
      return !!h;
    },
    attributes,
    actions: Object.create(null),
    handlers: Object.create(null),
  };

  // element → attribute name → dispose
  const mounted = new Map<El, Map<string, () => void>>();
  const roots = new Set<El | ShadowRoot>();
  const ignoreAny = prefixes.map((p) => `[${p}ignore]`).join();
  const ignored = (el: El) => !!el.closest(ignoreAny);
  let destroyed = false;

  const unmount = (els: Iterable<El>): void => {
    for (const el of els) {
      const m = mounted.get(el);
      if (m && mounted.delete(el)) for (const d of m.values()) d();
    }
  };

  const unmountAttr = (el: El, attr: string): void => {
    const m = mounted.get(el);
    m?.get(attr)?.();
    m?.delete(attr);
  };

  const mount = (el: El, attr: string, raw: string, value: string, only?: Set<string>): void => {
    const { plugin: name, key, mods } = parseAttr(raw);
    const plugin = attributes[name];
    if (!plugin || (only && !only.has(name))) return;
    unmountAttr(el, attr);

    const disposers: (() => void)[] = [];
    const cleanup = (f: () => void) => {
      disposers.push(f);
      return () => {
        const i = disposers.indexOf(f);
        if (i >= 0) disposers.splice(i, 1);
      };
    };
    const info = { plugin: name, el, attr };
    const error: Ctx['error'] = (message, extra) =>
      Object.assign(new Error(`${prefixes[0]}${name}: ${message}`), { info: { ...info, ...extra } });
    const report = (e: unknown) => onError(e, info);
    let fn: Evaluator | undefined;
    const watched = new WeakSet<Promise<unknown>>(); // promises already routed to onError
    const watch = (r: unknown) => {
      if (r instanceof Promise && !watched.has(r)) {
        watched.add(r);
        r.catch(report);
      }
    };
    const ctx: Ctx = {
      el,
      plugin: name,
      attr,
      key,
      value,
      mods,
      cased: (style = 'camel') => recase(key ?? '', (mods.get('case')?.[0] as CaseStyle) || style),
      evaluate: (evt, ...args) => {
        if (plugin.literal && !mods.has('dynamic')) return value;
        fn ??= expressions(value, ['el', 'evt', ...(plugin.args ?? [])]);
        const actx: ActionCtx = { el, evt, store, runtime, error, cleanup, report };
        const actions = new Proxy(
          {},
          {
            get:
              (_, name: string) =>
              (...args: any[]) => {
                const r = runtime.call(name, actx, args);
                watch(r); // async actions (requests) reject long after the expression returned
                return r;
              },
          },
        );
        const r = fn(store, actions, el, evt, ...args);
        watch(r); // an expression's own rejected promise is reported too, once
        return r;
      },
      // Root-owned: an attribute mounted from inside another effect must outlive that effect's re-runs.
      effect: (f) => {
        cleanup(rootEffect(f, report));
      },
      listen: (target, type, f, opts) => {
        const h = (e: Event) => {
          try {
            f(e);
          } catch (err) {
            report(err);
          }
        };
        target.addEventListener(type, h, opts);
        cleanup(() => target.removeEventListener(type, h, opts));
      },
      cleanup,
      error,
      report,
      store,
      runtime,
    };

    let m = mounted.get(el);
    if (!m) {
      m = new Map();
      mounted.set(el, m);
    }
    m.set(attr, () => {
      for (const d of disposers.splice(0)) d();
    });

    try {
      // Contract checks: a keyed directive without a key would otherwise write to the path ''.
      for (const [k, v] of [
        ['key', key],
        ['value', value],
      ] as const) {
        const rule = plugin[k];
        if (rule && (rule === 'required') === !v) throw error(`${rule === 'required' ? 'needs a' : 'takes no'} ${k}`);
      }
      const r: unknown = plugin.mount(ctx);
      if (typeof r === 'function') cleanup(r as () => void);
      else watch(r); // an async mount that rejects is reported, not lost
    } catch (e) {
      report(e);
    }
  };

  const mountEls = (els: Iterable<El>, only?: Set<string>): void => {
    for (const el of els) {
      if (ignored(el)) continue;
      for (const { name, value } of [...el.attributes]) {
        const raw = cut(prefixes, name);
        // Observers can report a subtree more than once (nested insertions); a mounted attribute stays as it is.
        if (raw && !mounted.get(el)?.has(name)) mount(el, name, raw, value, only);
      }
    }
  };

  const observer = new MutationObserver((records) => {
    for (const { type, target, attributeName, addedNodes, removedNodes } of records) {
      if (type === 'childList') {
        // A node that is still connected was moved (teleport, morph), not removed: it keeps its state.
        for (const n of removedNodes) if (!n.isConnected) unmount(tree(n));
        for (const n of addedNodes) mountEls(tree(n));
      } else if (attributeName && isEl(target) && !ignored(target)) {
        const raw = cut(prefixes, attributeName);
        if (!raw) continue;
        const value = target.getAttribute(attributeName);
        if (value === null) unmountAttr(target, attributeName);
        else mount(target, attributeName, raw, value);
      }
    }
  });

  const apply = (root: El | ShadowRoot = document.documentElement, observe = true, only?: Set<string>) => {
    if (destroyed) return;
    mountEls(tree(root), only);
    if (observe && !roots.has(root)) {
      observer.observe(root, { subtree: true, childList: true, attributes: true });
      roots.add(root);
    }
  };

  const use = (...plugins: Plugin[]): void => {
    const added = new Set<string>();
    for (const p of plugins) {
      (runtime as any)[`${p.type}s`][p.name] = p;
      if (p.type === 'attribute') added.add(p.name);
    }
    if (added.size) for (const r of roots) apply(r, false, added);
  };

  const stopPatches = store.onPatch((patch) => runtime.emit('signal-patch', patch));
  use(...(options.plugins ?? []));

  const sigmx: Sigmx = {
    runtime,
    store,
    get $() {
      return store.$;
    },
    apply: (root, observe) => apply(root, observe),
    use,
    destroy: () => {
      destroyed = true;
      observer.disconnect();
      stopPatches();
      unmount([...mounted.keys()]);
      roots.clear();
    },
  };

  if (options.autoStart ?? true) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => sigmx.apply(), { once: true });
    } else {
      sigmx.apply();
    }
  }
  return sigmx;
};

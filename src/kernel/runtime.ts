import { functionCompiler } from './compile.js'
import { effect } from './reactive.js'
import { createStore } from './state.js'
import type { ActionCtx, AttributePlugin, Ctx, El, Evaluator, Mods, Plugin, Runtime, RuntimeOptions, Sigmx } from './contracts.js'
import { recase, type CaseStyle } from '../lib/casing.js'

const isEl = (n: Node): n is El => n instanceof HTMLElement || n instanceof SVGElement || n instanceof MathMLElement
/** An element (or shadow root) followed by every element under it; nothing for text and comment nodes. */
const tree = (n: Node): El[] =>
  isEl(n) ? [n, ...n.querySelectorAll<El>('*')] : n instanceof ShadowRoot ? [...n.querySelectorAll<El>('*')] : []

type Parsed = { plugin: string; key: string | undefined; mods: Mods }
const parsed = new Map<string, Parsed>()

/** 'on:click__debounce.300ms__prevent' → { plugin: 'on', key: 'click', mods: {debounce: ['300ms'], prevent: []} } */
export const parseAttr = (raw: string): Parsed => {
  let p = parsed.get(raw)
  if (!p) {
    const [head, ...modParts] = raw.split('__')
    const i = head.indexOf(':')
    const mods: Mods = new Map()
    for (const m of modParts) {
      const [name, ...args] = m.split('.')
      mods.set(name, args)
    }
    p = { plugin: i < 0 ? head : head.slice(0, i), key: i < 0 ? undefined : head.slice(i + 1), mods }
    parsed.set(raw, p)
  }
  return p
}

const fail = (message: string, info: Record<string, unknown>): Error =>
  Object.assign(new Error(message), { info })

/** Low-level constructor: you supply the expression pipeline. `createSigmx` wraps it with the runtime compiler. */
export const createRuntime = (options: RuntimeOptions): Sigmx => {
  const prefixes = ([] as string[]).concat(options.prefix ?? 'data-')
  const eventPrefixes = ([] as string[]).concat(options.eventPrefix ?? 'sigmx-')
  const store = options.store ?? createStore()
  const compiler = options.compile ?? functionCompiler
  const { expressions } = options
  const onError = options.onError ?? ((e, info) => console.error(e, info))
  const attributes: Record<string, AttributePlugin> = Object.create(null)
  const actions: Runtime['actions'] = Object.create(null)
  const handlers: Runtime['handlers'] = Object.create(null)

  const runtime: Runtime = {
    prefixes,
    attr: (name) => prefixes[0] + name,
    store,
    compiler,
    emit: (type, detail) => document.dispatchEvent(new CustomEvent(`sigmx-${type}`, { detail })),
    call: (name, ctx, args) => {
      const a = actions[name]
      if (!a) throw ctx.error(`unknown action @${name}`)
      return a.call(ctx, ...args)
    },
    eventPrefixes,
    handle: (event, data) => {
      const p = eventPrefixes.find((p) => event.startsWith(p))
      const h = handlers[p ? event.slice(p.length) : event]
      h?.handle(runtime, data)
      return !!h
    },
    attributes,
    actions,
    handlers,
  }

  // element → attribute name → dispose
  const mounted = new Map<El, Map<string, () => void>>()
  const roots = new Set<El | ShadowRoot>()
  const ignoreSelf = prefixes.map((p) => `[${p}ignore__self]`).join()
  const ignoreAny = prefixes.map((p) => `[${p}ignore]`).join()
  const ignored = (el: El) => el.matches(ignoreSelf) || !!el.closest(ignoreAny)

  const strip = (attr: string): string | undefined => {
    for (const p of prefixes) if (attr.startsWith(p)) return attr.slice(p.length)
  }

  const unmount = (els: Iterable<El>): void => {
    for (const el of els) {
      const m = mounted.get(el)
      if (m && mounted.delete(el)) for (const d of m.values()) d()
    }
  }

  const unmountAttr = (el: El, attr: string): void => {
    const m = mounted.get(el)
    m?.get(attr)?.()
    m?.delete(attr)
  }

  const actionsFor = (el: El, evt: Event | undefined, error: Ctx['error'], cleanup: (fn: () => void) => void) => {
    const ctx: ActionCtx = { el, evt, store, runtime, error, cleanup }
    return new Proxy({}, { get: (_, name: string) => (...args: any[]) => runtime.call(name, ctx, args) })
  }

  const mount = (el: El, attr: string, raw: string, value: string, only?: Set<string>): void => {
    const { plugin: name, key, mods } = parseAttr(raw)
    const plugin = attributes[name]
    if (!plugin || (only && !only.has(name))) return
    unmountAttr(el, attr)

    const disposers: (() => void)[] = []
    const info = { plugin: name, el, attr }
    const error: Ctx['error'] = (message, extra) => fail(`${prefixes[0]}${name}: ${message}`, { ...info, ...extra })
    const report = (e: unknown) => onError(e, info)
    let fn: Evaluator | undefined
    const ctx: Ctx = {
      el,
      plugin: name,
      attr,
      key,
      value,
      mods,
      cased: (style = 'camel') => recase(key ?? '', (mods.get('case')?.[0] as CaseStyle) || style),
      evaluate: (evt, ...args) => {
        fn ??= expressions(value, ['el', 'evt', ...(plugin.args ?? [])], plugin.returns ?? true)
        return fn(store, actionsFor(el, evt, error, ctx.cleanup), el, evt, ...args)
      },
      effect: (f) => disposers.push(effect(f, report)),
      listen: (target, type, f, opts) => {
        const h = (e: Event) => {
          try {
            f(e)
          } catch (err) {
            report(err)
          }
        }
        target.addEventListener(type, h, opts)
        disposers.push(() => target.removeEventListener(type, h, opts))
      },
      cleanup: (f) => disposers.push(f),
      error,
      store,
      runtime,
    }

    let m = mounted.get(el)
    if (!m) mounted.set(el, (m = new Map()))
    m.set(attr, () => {
      for (const d of disposers.splice(0)) d()
    })

    try {
      if (plugin.key === 'required' && !key) throw error('needs a key')
      if (plugin.key === 'forbidden' && key) throw error('takes no key')
      if (plugin.value === 'required' && !value) throw error('needs a value')
      if (plugin.value === 'forbidden' && value) throw error('takes no value')
      const r = plugin.mount(ctx)
      if (typeof r === 'function') disposers.push(r)
    } catch (e) {
      report(e)
    }
  }

  const mountEls = (els: Iterable<El>, only?: Set<string>): void => {
    for (const el of els) {
      if (ignored(el)) continue
      for (const { name, value } of [...el.attributes]) {
        const raw = strip(name)
        if (raw) mount(el, name, raw, value, only)
      }
    }
  }

  const observer = new MutationObserver((records) => {
    for (const { type, target, attributeName, addedNodes, removedNodes } of records) {
      if (type === 'childList') {
        for (const n of removedNodes) unmount(tree(n))
        for (const n of addedNodes) mountEls(tree(n))
      } else if (attributeName && isEl(target) && !ignored(target)) {
        const raw = strip(attributeName)
        if (!raw) continue
        const value = target.getAttribute(attributeName)
        if (value === null) unmountAttr(target, attributeName)
        else mount(target, attributeName, raw, value)
      }
    }
  })

  let ready = false
  const apply = (root: El | ShadowRoot = document.documentElement, observe = true, only?: Set<string>) => {
    mountEls(tree(root), only)
    if (observe && !roots.has(root)) {
      observer.observe(root, { subtree: true, childList: true, attributes: true })
      roots.add(root)
    }
    if (!ready && roots.has(document.documentElement)) {
      ready = true
      runtime.emit('ready')
    }
  }

  const use = (...plugins: Plugin[]): void => {
    const added = new Set<string>()
    for (const p of plugins) {
      if (p.type === 'attribute') {
        attributes[p.name] = p
        added.add(p.name)
      } else if (p.type === 'action') actions[p.name] = p
      else handlers[p.name] = p
    }
    if (added.size) for (const r of roots) apply(r, false, added)
  }

  const stopPatches = store.onPatch((patch) => runtime.emit('signal-patch', patch))
  use(...(options.plugins ?? []))

  const sigmx: Sigmx = {
    runtime,
    store,
    get $() {
      return store.$
    },
    apply: (root, observe) => apply(root, observe),
    use,
    destroy: () => {
      observer.disconnect()
      stopPatches()
      unmount([...mounted.keys()])
      roots.clear()
    },
  }

  if (options.autoStart ?? true) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => sigmx.apply(), { once: true })
    } else {
      sigmx.apply()
    }
  }
  return sigmx
}

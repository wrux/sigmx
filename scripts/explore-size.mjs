// Size exploration: apply candidate cuts to a scratch copy of src/ and measure the gzipped effect.
import * as esbuild from 'esbuild'
import { gzipSync } from 'node:zlib'
import { cpSync, rmSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cases = {
  core: `import { createSigmx } from './kernel'; createSigmx()`,
  minimal: `import { createSigmx } from './kernel'; import { minimal } from './presets/minimal'; createSigmx({ plugins: minimal })`,
  fetch: `import { createSigmx } from './kernel'; import { signals, text, show, on, httpGet, httpPost, applyElements, applyState, indicator } from './plugins'; createSigmx({ plugins: [signals, text, show, on, httpGet, httpPost, applyElements, applyState, indicator] })`,
  all: `import { sigmx } from './standalone'; console.log(sigmx)`,
}
const measure = async (dir) => {
  const out = {}
  for (const [k, contents] of Object.entries(cases)) {
    const r = await esbuild.build({ stdin: { contents, resolveDir: dir, loader: 'ts' }, bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, mangleProps: /^_/, logLevel: 'silent' })
    out[k] = gzipSync(r.outputFiles[0].contents, { level: 9 }).length
  }
  return out
}
const patch = (dir, file, pairs) => {
  const p = join(dir, file)
  let s = readFileSync(p, 'utf8')
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(`patch miss in ${file}: ${a.slice(0, 60)}`)
    s = s.replace(a, b)
  }
  writeFileSync(p, s)
}
const R = 'kernel/runtime.ts', S = 'kernel/state.ts', C = 'kernel/compile.ts'
const variants = {
  'A  no error isolation (errors throw; no onError)': (d) => patch(d, R, [
    ["      const r = plugin.mount(ctx)\n      if (typeof r === 'function') disposers.push(r)\n    } catch (e) {\n      report(e)\n    }", "      const r = plugin.mount(ctx)\n      if (typeof r === 'function') disposers.push(r)\n    } finally {\n    }"],
    ["        const h = (e: Event) => {\n          try {\n            f(e)\n          } catch (err) {\n            report(err)\n          }\n        }", "        const h = f"],
    ["      effect: (f) => disposers.push(effect(f, report)),", "      effect: (f) => disposers.push(effect(f)),"],
  ]),
  'B  no data-ignore support': (d) => patch(d, R, [
    ["  const ignored = (el: El) => el.matches(ignoreSelf) || !!el.closest(ignoreAny)", "  const ignored = (_el: El) => false"],
    ["  const ignoreSelf = prefixes.map((p) => `[${p}ignore__self]`).join()\n  const ignoreAny = prefixes.map((p) => `[${p}ignore]`).join()\n", ""],
  ]),
  'C  no eventPrefix stripping in core': (d) => patch(d, R, [
    ["    handle: (event, data) => {\n      const p = eventPrefixes.find((p) => event.startsWith(p))\n      const h = handlers[p ? event.slice(p.length) : event]\n      h?.handle(runtime, data)\n      return !!h\n    },", "    handle: (event, data) => {\n      const h = handlers[event]\n      h?.handle(runtime, data)\n      return !!h\n    },"],
  ]),
  'D  no namespace enumeration ($ ownKeys/has/delete)': (d) => patch(d, S, [
    ["        deleteProperty: (_, k) => (str(k) && remove(join(p, k)), true),\n        has: (_, k) => str(k) && !!names()?.has(k),\n        ownKeys: () => [...(names() ?? [])],\n        getOwnPropertyDescriptor: (_, k) =>\n          str(k) && names()?.has(k)\n            ? { enumerable: true, configurable: true, writable: true, value: get(join(p, k)) }\n            : undefined,\n", ""],
    ["      const names = () => (shape.value, kids.get(p))\n", ""],
  ]),
  'E  no empty-namespace preservation in snapshot': (d) => patch(d, S, [
    ["    // Empty namespaces still appear as `{}`.\n    for (const p of kids.keys()) {\n      if (p && p !== at && under(p, at) && ok(p) && !kids.get(p)!.size) expand(out, rel(p), {})\n    }\n", ""],
  ]),
  'F  arrays are plain (no mutation notify)': (d) => patch(d, S, [
    ["      const v = s.value\n      return Array.isArray(v) ? wrapArray(v, s, p) : v", "      return s.value"],
    ["  /** Arrays are returned through a proxy so in-place mutation notifies the leaf. */", "  // @ts-ignore unused\n  const _unused = 0\n  /** Arrays are returned through a proxy so in-place mutation notifies the leaf. */"],
  ]),
  'G  no last-statement value fallback in expressions': (d) => patch(d, C, [
    ["    try {\n      fn = make(`return(${code}\\n)`)\n    } catch {\n      const parts = splitStatements(code)\n      const last = parts.pop() ?? ''\n      try {\n        fn = make(`${parts.join(';')};return(${last}\\n)`)\n      } catch {\n        fn = make(code)\n      }\n    }", "    try {\n      fn = make(`return(${code}\\n)`)\n    } catch {\n      fn = make(code)\n    }"],
  ]),
  'H  no parsed-attribute cache': (d) => patch(d, R, [
    ["  let p = parsed.get(raw)\n  if (!p) {", "  let p: Parsed | undefined\n  if (!p) {"],
    ["    parsed.set(raw, p)\n", ""],
  ]),
  'I  target esnext instead of es2022': 'esnext',
  'K  kernel cuts B+D+E+G combined': (d) => { for (const k of ['B  no data-ignore support','D  no namespace enumeration ($ ownKeys/has/delete)','E  no empty-namespace preservation in snapshot','G  no last-statement value fallback in expressions']) variants[k](d) },
  'J  no late use() re-apply': (d) => patch(d, R, [
    ["    if (added.size) for (const r of roots) apply(r, false, added)\n", ""],
  ]),
  'L  request client without form encoding': (d) => patch(d, 'plugins/functions/request.ts', [
    [/    } else \{\n      const form = [\s\S]*?\n    }\n    return \{ url: u\.toString\(\)/.exec(readFileSync(join(d, 'plugins/functions/request.ts'), 'utf8'))[0], "    }\n    return { url: u.toString()"],
  ]),
  'M  request client without retry/backoff/reconnect': (d) => patch(d, 'plugins/functions/request.ts', [
    ["          emit('error', { status: res.status })\n          if (!retry.onStatusError) return\n          await backoff()\n          continue", "          emit('error', { status: res.status })\n          return"],
    ["          if (!o.reconnect) return\n          await backoff()\n          continue", "          return"],
    ["        if (hide.signal.aborted) await untilVisible()\n        else await backoff()", "        if (hide.signal.aborted) await untilVisible()\n        else return"],
    ["  const backoff = async () => {\n    if (attempt++ >= retry.attempts) throw new Error('retries exhausted')\n    emit('retrying', { attempt })\n    await sleep(wait, ac.signal)\n    wait = Math.min(wait * retry.factor, retry.max)\n  }\n", ""],
    ["const sleep = (ms: number, signal: AbortSignal) =>\n  new Promise<void>((resolve) => {\n    const t = setTimeout(resolve, ms)\n    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })\n  })\n", ""],
    ["  const retry = { attempts: 5, interval: 1000, factor: 2, max: 30_000, onStatusError: false, ...o.retry }\n", "  const retry = { interval: 1000 }\n"],
    ["  let attempt = 0\n  let wait = retry.interval\n", "  let wait = retry.interval\n"],
  ]),
  'N  request client without hidden-tab pausing': (d) => patch(d, 'plugins/functions/request.ts', [
    ["      const hide = new AbortController()\n      const onHide = () => document.hidden && hide.abort()\n      if (pauseWhenHidden) document.addEventListener('visibilitychange', onHide)\n", ""],
    ["signal: AbortSignal.any([ac.signal, hide.signal])", "signal: ac.signal"],
    ["        if (hide.signal.aborted) await untilVisible()\n        else await backoff()\n      } finally {\n        document.removeEventListener('visibilitychange', onHide)\n      }", "        await backoff()\n      }"],
    ["const untilVisible = () =>\n  new Promise<void>((resolve) => document.addEventListener('visibilitychange', () => !document.hidden && resolve(), { once: true }))\n", ""],
    ["  const pauseWhenHidden = !(o.openWhenHidden ?? method !== 'GET')\n", ""],
  ]),
  'O  morph without pantry / cross-ancestor moves': (d) => patch(d, 'plugins/server-events/morph.ts', [
    ["const discard = (n: Node, ctx: Ctx): void => {\n  containsKept(n, ctx) ? ctx.pantry.append(n) : (n as ChildNode).remove()\n}", "const discard = (n: Node, _ctx: Ctx): void => {\n  ;(n as ChildNode).remove()\n}"],
    ["  return ctx.pantry.querySelector(`#${CSS.escape(id)}`) ?? document.getElementById(id)", "  return null"],
    ["    } else if (isEl(nb) && containsKept(nb, ctx)) {\n      // Build a shell so the wanted descendants can be pulled in rather than recreated.\n      const shell = document.createElementNS(nb.namespaceURI ?? 'http://www.w3.org/1999/xhtml', nb.tagName)\n      parent.insertBefore(shell, cur)\n      morphNode(shell, nb, ctx)\n    } else {", "    } else {"],
    ["const containsKept = (n: Node, ctx: Ctx): boolean =>\n  isEl(n) && (ctx.keep.has(n.id) || [...n.querySelectorAll('[id]')].some((e) => ctx.keep.has(e.id)))\n", ""],
  ]),
  'P  patch-elements without full-document responses': (d) => patch(d, 'plugins/server-events/apply-elements.ts', [
    ["  if (/<\\/(html|head|body)>/i.test(html)) return new DOMParser().parseFromString(html, 'text/html')\n", ""],
    ["  if (parsed instanceof Document) {\n    if (parsed.head.childNodes.length) morphInner(document.head, parsed.head, o)\n    morph(document.body, parsed.body, o)\n    return\n  }\n", ""],
  ]),
}

const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'sigmx-')); cpSync('src', join(d, 'src'), { recursive: true }); writeFileSync(join(d, 'package.json'), '{"sideEffects":false}'); cpSync('tsconfig.json', join(d, 'tsconfig.json')); return join(d, 'src') }
const base = scratch()
const baseline = await measure(base)
console.log('baseline gzip'.padEnd(52), ...Object.entries(baseline).map(([k, v]) => `${k}=${v}`))
console.log('variant'.padEnd(52), 'core'.padStart(6), 'minimal'.padStart(8), 'fetch'.padStart(7), 'all'.padStart(6), '  (delta bytes gzip; negative = smaller)')
for (const [name, apply] of Object.entries(variants)) {
  const dir = scratch()
  try {
    let m
    if (typeof apply === 'function') { apply(dir); m = await measure(dir) }
    else {
      m = {}
      for (const [k, contents] of Object.entries(cases)) {
        const r = await esbuild.build({ stdin: { contents, resolveDir: dir, loader: 'ts' }, bundle: true, minify: true, format: 'esm', target: apply, write: false, mangleProps: /^_/, logLevel: 'silent' })
        m[k] = gzipSync(r.outputFiles[0].contents, { level: 9 }).length
      }
    }
    console.log(name.padEnd(52), ...Object.keys(cases).map((k) => String(m[k] - baseline[k]).padStart(k === 'minimal' ? 8 : k === 'fetch' ? 7 : 6)))
  } catch (e) {
    console.log(name.padEnd(52), 'FAILED:', e.message.slice(0, 80))
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true })
  }
}
rmSync(join(base, '..'), { recursive: true, force: true })

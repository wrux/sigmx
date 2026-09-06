// Id-aware DOM morphing: update `target` in place to match `next`, keeping elements whose ids
// appear in both trees (and their state: focus, input values, scroll) instead of recreating them.

export type MorphOptions = {
  /** Attribute that marks a subtree to leave alone when present on both sides. */
  ignoreAttr?: string
  /** Attribute listing space-separated attribute names to keep from the old element. */
  preserveAttr?: string
}

type Ctx = { keep: Set<string>; pantry: DocumentFragment; ignore: string; preserve: string }

const ran = new WeakSet<Node>()
const isEl = (n: Node | null): n is Element => !!n && n.nodeType === 1

/** Scripts inserted through the DOM do not execute; replace them with fresh copies that do. */
export const activateScripts = (root: Node): void => {
  const scripts = isEl(root) ? [root, ...root.querySelectorAll('script')].filter((n) => n.tagName === 'SCRIPT') : []
  for (const old of scripts as HTMLScriptElement[]) {
    if (ran.has(old)) continue
    const s = document.createElement('script')
    for (const { name, value } of old.attributes) s.setAttribute(name, value)
    s.text = old.text
    ran.add(s)
    old.replaceWith(s)
  }
}

const containsKept = (n: Node, ctx: Ctx): boolean =>
  isEl(n) && (ctx.keep.has(n.id) || [...n.querySelectorAll('[id]')].some((e) => ctx.keep.has(e.id)))

/** Remove a node, or park it if it (or a descendant) is wanted elsewhere in the new tree. */
const discard = (n: Node, ctx: Ctx): void => {
  containsKept(n, ctx) ? ctx.pantry.append(n) : (n as ChildNode).remove()
}

const place = (parent: Node, node: Node, before: Node | null): void => {
  const p = parent as Node & { moveBefore?: (n: Node, b: Node | null) => void }
  try {
    p.moveBefore ? p.moveBefore(node, before) : parent.insertBefore(node, before)
  } catch {
    parent.insertBefore(node, before)
  }
}

const findKept = (id: string, from: Node | null, ctx: Ctx): Element | null => {
  for (let n = from; n; n = n.nextSibling) if (isEl(n) && n.id === id) return n
  return ctx.pantry.querySelector(`#${CSS.escape(id)}`) ?? document.getElementById(id)
}

const compatible = (old: Node, next: Node, ctx: Ctx): boolean =>
  old.nodeType === next.nodeType &&
  old.nodeName === next.nodeName &&
  (!isEl(old) || !old.id || old.id === (next as Element).id) &&
  !(isEl(old) && ctx.keep.has(old.id) && old.id !== (next as Element).id)

const syncAttributes = (a: Element, b: Element, ctx: Ctx): void => {
  const keep = new Set((b.getAttribute(ctx.preserve) ?? a.getAttribute(ctx.preserve) ?? '').split(/\s+/).filter(Boolean))
  // Live form state (what the user typed or ticked) is only overwritten when the server's
  // default actually changed, i.e. the *attribute* differs between old and new markup.
  let changed = false
  const attrDiffers = (name: string) => !keep.has(name) && a.getAttribute(name) !== b.getAttribute(name)
  if (a instanceof HTMLInputElement && b instanceof HTMLInputElement && a.type !== 'file') {
    if (attrDiffers('value')) (a.value = b.getAttribute('value') ?? ''), (changed = true)
    if (attrDiffers('checked')) (a.checked = b.hasAttribute('checked')), (changed = true)
  } else if (a instanceof HTMLTextAreaElement && b instanceof HTMLTextAreaElement) {
    if (!keep.has('value') && a.defaultValue !== b.defaultValue) (a.value = b.defaultValue), (changed = true)
  } else if (a instanceof HTMLOptionElement && b instanceof HTMLOptionElement) {
    if (attrDiffers('selected')) (a.selected = b.hasAttribute('selected')), (changed = true)
  }
  for (const { name, value } of b.attributes) if (!keep.has(name) && a.getAttribute(name) !== value) a.setAttribute(name, value)
  for (const { name } of [...a.attributes]) if (!keep.has(name) && !b.hasAttribute(name)) a.removeAttribute(name)

  if (changed) (a instanceof HTMLOptionElement ? a.closest('select') : a)?.dispatchEvent(new Event('sigmx-prop-change', { bubbles: true }))
}

const morphNode = (a: Node, b: Node, ctx: Ctx): void => {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) {
    const fresh = document.importNode(b, true)
    ;(a as ChildNode).replaceWith(fresh)
    activateScripts(fresh)
    return
  }
  if (!isEl(a) || !isEl(b)) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue
    return
  }
  if (a.hasAttribute(ctx.ignore) && b.hasAttribute(ctx.ignore)) return
  syncAttributes(a, b, ctx)
  if (a instanceof HTMLTemplateElement && b instanceof HTMLTemplateElement) {
    a.innerHTML = b.innerHTML
  } else if (!a.isEqualNode(b)) {
    morphChildren(a, b, ctx)
  }
}

const morphChildren = (parent: Node, next: Node, ctx: Ctx): void => {
  let cur: Node | null = parent.firstChild
  for (const nb of [...next.childNodes]) {
    if (isEl(nb) && nb.id && ctx.keep.has(nb.id)) {
      const match = findKept(nb.id, cur, ctx)
      if (match) {
        while (cur && cur !== match) {
          const n = cur
          cur = cur.nextSibling
          discard(n, ctx)
        }
        if (cur !== match) place(parent, match, cur)
        else cur = match.nextSibling
        morphNode(match, nb, ctx)
        continue
      }
    }
    let m: Node | null = cur
    while (m && !compatible(m, nb, ctx)) m = m.nextSibling
    if (m) {
      while (cur && cur !== m) {
        const n = cur
        cur = cur.nextSibling
        discard(n, ctx)
      }
      cur = m.nextSibling
      morphNode(m, nb, ctx)
    } else if (isEl(nb) && containsKept(nb, ctx)) {
      // Build a shell so the wanted descendants can be pulled in rather than recreated.
      const shell = document.createElementNS(nb.namespaceURI ?? 'http://www.w3.org/1999/xhtml', nb.tagName)
      parent.insertBefore(shell, cur)
      morphNode(shell, nb, ctx)
    } else {
      const fresh = document.importNode(nb, true)
      parent.insertBefore(fresh, cur)
      activateScripts(fresh)
    }
  }
  while (cur) {
    const n = cur
    cur = cur.nextSibling
    discard(n, ctx)
  }
}

const context = (target: Node, next: Node, o: MorphOptions): Ctx => {
  const keep = new Set<string>()
  const wanted = new Map<string, string>()
  for (const e of isEl(next) ? [next, ...next.querySelectorAll('[id]')] : [...(next as ParentNode).querySelectorAll('[id]')]) {
    if (e.id) wanted.set(e.id, e.tagName)
  }
  const olds = isEl(target) ? [target, ...target.querySelectorAll('[id]')] : [...(target as ParentNode).querySelectorAll('[id]')]
  for (const e of olds) if (e.id && wanted.get(e.id) === e.tagName) keep.add(e.id)
  return { keep, pantry: document.createDocumentFragment(), ignore: o.ignoreAttr ?? 'data-ignore-morph', preserve: o.preserveAttr ?? 'data-preserve-attr' }
}

/** Morph `target` into `next` (outer). */
export const morph = (target: Element, next: Element, o: MorphOptions = {}): void => {
  const ctx = context(target, next, o)
  morphNode(target, next, ctx)
}

/** Morph the children of `target` into the children of `next` (inner). */
export const morphInner = (target: Element, next: ParentNode, o: MorphOptions = {}): void => {
  const ctx = context(target, next, o)
  morphChildren(target, next, ctx)
}

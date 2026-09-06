// Id-aware DOM morphing: update `target` in place to match `next`, keeping elements whose ids
// appear in both trees (and their state: focus, input values, scroll) instead of recreating them.

export type MorphOptions = {
  /** Attribute that marks a subtree to leave alone when present on both sides. */
  ignoreAttr?: string;
  /** Attribute listing space-separated attribute names to keep from the old element. */
  preserveAttr?: string;
};

/** `keep`: id → the old element to reuse wherever the new tree wants that id. */
type Ctx = { keep: Map<string, Element>; ignore: string; preserve: string };

const ran = new WeakSet<Node>();
const isEl = (n: Node | null): n is Element => n?.nodeType === 1;

/** Scripts inserted through the DOM do not execute; replace them with fresh copies that do. */
export const activateScripts = (root: Node): void => {
  if (!isEl(root)) return;
  for (const old of [root, ...root.querySelectorAll('script')] as HTMLScriptElement[]) {
    if (!old.matches('script') || ran.has(old)) continue;
    const s = document.createElement('script');
    for (const { name, value } of old.attributes) s.setAttribute(name, value);
    s.text = old.text;
    ran.add(s);
    old.replaceWith(s);
  }
};

/** Import `b` into the document, `insert` it, and run its scripts. */
const fresh = (b: Node, insert: (n: Node) => void): void => {
  const n = document.importNode(b, true);
  insert(n);
  activateScripts(n);
};

const idsIn = (n: Node): Element[] =>
  [n, ...((n as ParentNode).querySelectorAll?.('[id]') ?? [])].filter((e) => isEl(e) && e.id) as Element[];
const containsKept = (n: Node, ctx: Ctx): boolean => idsIn(n).some((e) => ctx.keep.has(e.id));

const place = (parent: Node, node: Node, before: Node | null): void => {
  try {
    (parent as any).moveBefore(node, before);
  } catch {
    parent.insertBefore(node, before);
  }
};

/** Same kind of node, and an old element with an id is only reused for the same id. */
const compatible = (old: Node, next: Node): boolean =>
  old.nodeName === next.nodeName && (!isEl(old) || !old.id || old.id === (next as Element).id);

const syncAttributes = (a: Element, b: Element, ctx: Ctx): void => {
  const keep = new Set((b.getAttribute(ctx.preserve) ?? a.getAttribute(ctx.preserve) ?? '').split(/\s+/));
  const differs = (name: string) => !keep.has(name) && a.getAttribute(name) !== b.getAttribute(name);
  let changed = false;
  // Live form state (what the user typed or ticked) is only overwritten when the server's
  // default actually changed, i.e. the *attribute* differs between old and new markup.
  const live =
    a instanceof HTMLInputElement && a.type !== 'file'
      ? ['value', 'checked']
      : a instanceof HTMLOptionElement
        ? ['selected']
        : [];
  for (const name of live) {
    if (differs(name)) {
      (a as any)[name] = name === 'value' ? (b.getAttribute(name) ?? '') : b.hasAttribute(name);
      changed = true;
    }
  }
  if (
    a instanceof HTMLTextAreaElement &&
    !keep.has('value') &&
    a.defaultValue !== (b as HTMLTextAreaElement).defaultValue
  ) {
    a.value = (b as HTMLTextAreaElement).defaultValue;
    changed = true;
  }
  for (const { name, value } of b.attributes)
    if (!keep.has(name) && a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!keep.has(name) && !b.hasAttribute(name)) a.removeAttribute(name);

  if (changed)
    (a instanceof HTMLOptionElement ? a.closest('select') : a)?.dispatchEvent(
      new Event('sigmx-prop-change', { bubbles: true }),
    );
};

const morphNode = (a: Node, b: Node, ctx: Ctx): void => {
  if (a.nodeName !== b.nodeName) {
    fresh(b, (n) => (a as ChildNode).replaceWith(n));
    return;
  }
  if (!isEl(a) || !isEl(b)) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  // A changed script must run again; patching its text or src in place would not execute it.
  if (b.localName === 'script' && !a.isEqualNode(b)) {
    fresh(b, (n) => a.replaceWith(n));
    return;
  }
  if (a.hasAttribute(ctx.ignore) && b.hasAttribute(ctx.ignore)) return;
  syncAttributes(a, b, ctx);
  if (a instanceof HTMLTemplateElement) a.innerHTML = b.innerHTML;
  else if (!a.isEqualNode(b)) morphChildren(a, b, ctx);
};

const morphChildren = (parent: Node, next: Node, ctx: Ctx): void => {
  let cur: Node | null = parent.firstChild;
  /**
   * Remove old siblings from `cur` up to (not including) `stop`; returns whether `stop` was reached.
   * Kept elements inside removed subtrees stay referenced by `ctx.keep` and are pulled back in later.
   */
  const dropUntil = (stop: Node | null): boolean => {
    while (cur && cur !== stop) {
      const n = cur;
      cur = cur.nextSibling;
      // A kept element stays connected until `place` moves it, so focus, media and iframe state survive.
      if (!(isEl(n) && ctx.keep.get(n.id) === n)) (n as ChildNode).remove();
    }
    return cur === stop;
  };
  for (const nb of [...next.childNodes]) {
    const kept = isEl(nb) && ctx.keep.get(nb.id);
    if (kept) {
      // Ahead among the old siblings: drop what precedes it. Elsewhere (moved, or inside a removed
      // subtree): pull it in here and leave the remaining old siblings for the next new children.
      let m: Node | null = cur;
      while (m && m !== kept) m = m.nextSibling;
      if (m) {
        dropUntil(kept);
        cur = kept.nextSibling;
      } else place(parent, kept, cur);
      morphNode(kept, nb, ctx);
      continue;
    }
    let m: Node | null = cur;
    while (m && !compatible(m, nb)) m = m.nextSibling;
    if (m) {
      dropUntil(m);
      cur = m.nextSibling;
      morphNode(m, nb, ctx);
    } else if (isEl(nb) && containsKept(nb, ctx)) {
      // Build a shell (same element, attributes, no children) so the wanted descendants can be pulled in.
      const shell = document.importNode(nb, false);
      parent.insertBefore(shell, cur);
      morphNode(shell, nb, ctx);
    } else {
      fresh(nb, (n) => parent.insertBefore(n, cur));
    }
  }
  dropUntil(null);
};

const context = (target: Node, next: Node, o: MorphOptions): Ctx => {
  const wanted = new Map(idsIn(next).map((e) => [e.id, e.tagName]));
  return {
    keep: new Map(idsIn(target).flatMap((e) => (wanted.get(e.id) === e.tagName ? [[e.id, e] as const] : []))),
    ignore: o.ignoreAttr ?? 'data-ignore-morph',
    preserve: o.preserveAttr ?? 'data-preserve-attr',
  };
};

export const morph = (target: Element, next: Element, o: MorphOptions = {}): void => {
  morphNode(target, next, context(target, next, o));
};

export const morphInner = (target: Element, next: ParentNode, o: MorphOptions = {}): void => {
  morphChildren(target, next, context(target, next, o));
};

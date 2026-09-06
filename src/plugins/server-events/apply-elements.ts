import { srv } from '../def.js';
import { activateScripts, morph, morphInner } from './morph.js';

/**
 * `<head>` children are matched by equality, not position: a stylesheet or meta that is already
 * present is left alone (no reload flash), missing ones are added, absent ones removed.
 */
const mergeHead = (head: HTMLHeadElement, next: HTMLHeadElement) => {
  const wanted = [...next.children];
  for (const old of [...head.children]) {
    const i = wanted.findIndex((n) => n.isEqualNode(old));
    if (i < 0) old.remove();
    else wanted.splice(i, 1);
  }
  for (const n of wanted) {
    const copy = document.importNode(n, true);
    head.append(copy);
    activateScripts(copy);
  }
};

const parse = (html: string): DocumentFragment | Document => {
  if (/^\s*<(!doctype|html)[\s>]|<\/(html|head|body)>/i.test(html))
    return new DOMParser().parseFromString(html, 'text/html');
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};

/** Server event `patch-elements`: `elements <html>`, `selector`, `mode`. */
export const applyElements = srv('patch-elements', (runtime, { elements = '', selector = '', mode = 'outer' }) => {
  const o = { ignoreAttr: runtime.attr('ignore-morph'), preserveAttr: runtime.attr('preserve-attr') };
  const parsed = parse(elements);
  if (parsed instanceof Document) {
    for (const { name, value } of parsed.documentElement.attributes) document.documentElement.setAttribute(name, value);
    if (parsed.head.childNodes.length) mergeHead(document.head, parsed.head);
    morph(document.body, parsed.body, o);
    return;
  }
  /** Put `content` at `t` per `mode`; a lone element in outer mode is morphed rather than swapped. */
  const patch = (t: Element, content: DocumentFragment) => {
    const nodes = [...content.childNodes];
    if (mode === 'outer' && nodes.length === 1 && nodes[0].nodeType === 1) morph(t, nodes[0] as Element, o);
    else if (mode === 'inner') morphInner(t, content, o);
    else {
      mode === 'outer' || mode === 'replace' ? t.replaceWith(content) : (t as any)[mode](content);
      for (const n of nodes) activateScripts(n);
    }
  };
  if (selector) {
    const targets = [...document.querySelectorAll(selector)];
    if (mode === 'remove') for (const t of targets) t.remove();
    else
      targets.forEach((t, i) => {
        patch(t, i + 1 < targets.length ? (parsed.cloneNode(true) as DocumentFragment) : parsed);
      });
  } else {
    if (mode !== 'outer' && mode !== 'replace') throw new Error(`mode "${mode}" needs a selector`);
    for (const child of [...parsed.children]) {
      const target = child.id && document.getElementById(child.id);
      if (target) {
        const f = document.createDocumentFragment();
        f.append(child);
        patch(target, f);
      }
    }
  }
});

import { handler, type Runtime } from '../../kernel/index.js';
import { activateScripts, morph, morphInner } from './morph.js';

const MODES = ['outer', 'inner', 'replace', 'prepend', 'append', 'before', 'after', 'remove'] as const;
type Mode = (typeof MODES)[number];

const parse = (html: string): DocumentFragment | Document => {
  if (/<\/(html|head|body)>/i.test(html)) return new DOMParser().parseFromString(html, 'text/html');
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};

const apply = (runtime: Runtime, html: string, selector: string, mode: Mode): void => {
  const o = { ignoreAttr: runtime.attr('ignore-morph'), preserveAttr: runtime.attr('preserve-attr') };
  const parsed = parse(html);
  if (parsed instanceof Document) {
    if (parsed.head.childNodes.length) morphInner(document.head, parsed.head, o);
    morph(document.body, parsed.body, o);
    return;
  }
  const frag = parsed;
  if (mode === 'remove') {
    for (const t of document.querySelectorAll(selector)) t.remove();
    return;
  }
  if (!selector) {
    if (mode !== 'outer' && mode !== 'replace') throw new Error(`patch-elements mode "${mode}" needs a selector`);
    for (const child of [...frag.children]) {
      const target = child.id && document.getElementById(child.id);
      if (!target) {
        console.warn('patch-elements: no element with id', child.id);
        continue;
      }
      if (mode === 'outer') morph(target, child, o);
      else {
        target.replaceWith(child);
        activateScripts(child);
      }
    }
    return;
  }
  const targets = [...document.querySelectorAll(selector)];
  if (!targets.length) console.warn('patch-elements: no elements match', selector);
  targets.forEach((t, i) => {
    const content = i === targets.length - 1 ? frag : (frag.cloneNode(true) as DocumentFragment);
    const nodes = [...content.childNodes];
    if (mode === 'outer' && nodes.length === 1 && isElement(nodes[0])) morph(t, nodes[0], o);
    else if (mode === 'inner') morphInner(t, content, o);
    else {
      if (mode === 'outer' || mode === 'replace') t.replaceWith(content);
      else t[mode](content);
      for (const n of nodes) activateScripts(n);
    }
  });
};

const isElement = (n: Node): n is Element => n.nodeType === 1;

/** Server event `patch-elements`: `elements <html>`, `selector`, `mode`, `useViewTransition true`. */
export const applyElements = handler({
  name: 'patch-elements',
  handle(runtime, { elements = '', selector = '', mode = 'outer', useViewTransition }) {
    if (!MODES.includes(mode as Mode)) throw new Error(`patch-elements: unknown mode "${mode}"`);
    const run = () => apply(runtime, elements, selector, mode as Mode);
    useViewTransition === 'true' && 'startViewTransition' in document ? document.startViewTransition(run) : run();
  },
});

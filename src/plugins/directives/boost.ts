import type { ActionCtx } from '../../kernel/index.js';
import { dir } from '../def.js';

/**
 * Turns same-origin links and forms inside the element into requests whose full-document response
 * is morphed into the current page, with history entries: `boost` on a container (or `body`).
 * Needs `httpGet`, `httpPost` and `applyElements`.
 */
export const boost = dir('boost', 10, ({ el, store, runtime, listen, error, cleanup, report }) => {
  const ctx: ActionCtx = { el, store, runtime, error, cleanup, report };
  let current = location.pathname + location.search;
  const go = (url: URL, method: string, evt: Event, form?: HTMLFormElement) => {
    evt.preventDefault();
    const p = runtime.call(method, { ...ctx, el: form ?? el, evt }, [url.href, { contentType: form && 'form' }]);
    Promise.resolve(p).then((r) => {
      // The address becomes the final URL: redirects are followed, GET forms carry their fields.
      const next = new URL(r && (r.redirected || (form && method === 'get')) ? r.url : url.href);
      current = next.pathname + next.search;
      history.pushState(null, '', next.href);
      const target = next.hash && document.querySelector(next.hash);
      target ? target.scrollIntoView() : scrollTo(0, 0);
    }, report);
  };
  listen(el, 'click', (e: MouseEvent) => {
    const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
    if (
      a &&
      !(e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target) &&
      !a.hasAttribute('download') &&
      a.origin === location.origin &&
      !(a.hash && a.pathname === location.pathname && a.search === location.search)
    )
      go(new URL(a.href), 'get', e);
  });
  listen(el, 'submit', (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement;
    // Attributes, not properties: an <input name="action"> shadows form.action; the submitter may override.
    const attr = (name: string) => e.submitter?.getAttribute(`form${name}`) ?? form.getAttribute(name);
    const method = (attr('method') ?? 'get').toLowerCase();
    const url = new URL(attr('action') || location.href, location.href);
    if (!e.defaultPrevented && !form.target && method !== 'dialog' && url.origin === location.origin)
      go(url, method === 'post' ? 'post' : 'get', e, form);
  });
  listen(window, 'popstate', () => {
    const now = location.pathname + location.search;
    if (now === current) return; // a hash change: nothing to fetch
    current = now;
    Promise.resolve(runtime.call('get', ctx, [location.href, {}])).then(undefined, report);
  });
});

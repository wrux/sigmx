import type { ActionCtx } from '../../kernel/index.js';
import { dir } from '../def.js';

/**
 * Turns same-origin links and forms inside the element into requests whose full-document response
 * is morphed into the current page, with history entries: `boost` on a container (or `body`).
 * Needs `httpGet`, `httpPost` and `applyElements`. `__replace` replaces the history entry instead.
 */
export const boost = dir('boost', 10, ({ el, store, runtime, listen, error, cleanup }) => {
  const ctx: ActionCtx = { el, store, runtime, error, cleanup };
  const go = (url: string, method: string, evt: Event, form?: HTMLFormElement) => {
    evt.preventDefault();
    const p = runtime.call(method, { ...ctx, el: form ?? el, evt }, [
      url,
      { contentType: form && 'form', openWhenHidden: true },
    ]);
    history.pushState(null, '', url);
    Promise.resolve(p).then(() => scrollTo(0, 0));
  };
  listen(el, 'click', (e: MouseEvent) => {
    const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
    if (
      a &&
      !(e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target) &&
      !a.hasAttribute('download') &&
      a.origin === location.origin &&
      !(a.hash && a.pathname === location.pathname)
    )
      go(a.href, 'get', e);
  });
  listen(el, 'submit', (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement;
    const url = new URL(form.action || location.href);
    if (!e.defaultPrevented && !form.target && url.origin === location.origin)
      go(url.href, form.method.toLowerCase() === 'post' ? 'post' : 'get', e, form);
  });
  listen(window, 'popstate', () => runtime.call('get', ctx, [location.href, { openWhenHidden: true }]));
});

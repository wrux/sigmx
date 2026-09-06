import { type ActionCtx, attribute } from '../../kernel/index.js';

/**
 * Turns same-origin links and forms inside the element into requests whose full-document response
 * is morphed into the current page, with history entries: `boost` on a container (or `body`).
 * Needs `httpGet`, `httpPost` and `applyElements`. `__replace` replaces the history entry instead.
 */
export const boost = attribute({
  name: 'boost',
  key: 'forbidden',
  value: 'forbidden',
  mount({ el, mods, store, runtime, listen, error, cleanup }) {
    const ctx: ActionCtx = { el, store, runtime, error, cleanup };
    const go = (url: string, method = 'get', evt?: Event, form?: HTMLFormElement) => {
      const o = form ? { contentType: 'form', selector: undefined, openWhenHidden: true } : { openWhenHidden: true };
      const p = runtime.call(method, { ...ctx, el: form ?? el, evt }, [url, o]);
      history[mods.has('replace') ? 'replaceState' : 'pushState'](null, '', url);
      Promise.resolve(p).then(() => scrollTo(0, 0));
    };
    listen(el, 'click', (e: MouseEvent) => {
      const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
      if (
        !a ||
        e.defaultPrevented ||
        e.button ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        a.target ||
        a.hasAttribute('download')
      )
        return;
      if (a.origin !== location.origin || (a.hash && a.pathname === location.pathname)) return;
      e.preventDefault();
      go(a.href, 'get', e);
    });
    listen(el, 'submit', (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (e.defaultPrevented || form.target) return;
      const url = new URL(form.action || location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      go(url.href, form.method.toLowerCase() === 'post' ? 'post' : 'get', e, form);
    });
    listen(window, 'popstate', () => runtime.call('get', ctx, [location.href, { openWhenHidden: true }]));
  },
});

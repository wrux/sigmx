// Plausible analytics for sigmx: a directive, a function and a server-event handler, all named
// `track`, that talk to Plausible's script API (`window.plausible(event, { props, callback })`).
// No runtime dependencies; the three plugins share one `send` helper.
import { action, attribute, handler } from 'sigmx';

export type Props = Record<string, string | number | boolean>;
type Options = { props?: Props; callback?: () => void };
type Plausible = ((event: string, options?: Options) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    plausible?: Plausible;
  }
}

/**
 * The script's global, or the same queue stub Plausible's snippet installs: calls made before the
 * script loads are replayed once it arrives, and are dropped harmlessly if it never does.
 */
const plausible = (): Plausible => {
  if (!window.plausible) {
    const queue: Plausible = (...args) => {
      queue.q?.push(args);
    };
    queue.q = [];
    window.plausible = queue;
  }
  return window.plausible;
};

/**
 * Send one event. Resolves when Plausible acknowledges it, straight away when only the queue stub
 * is present, and after one second regardless so a blocked script never stalls an expression.
 */
export const send = (name: string, props?: Props): Promise<void> =>
  new Promise((resolve) => {
    const p = plausible();
    if (p.q) return resolve();
    const timer = setTimeout(resolve, 1000);
    p(name, {
      props,
      callback: () => {
        clearTimeout(timer);
        resolve();
      },
    });
  });

/**
 * `data-track:signup="{ plan: $plan }"` sends a `Signup` event on click. `__event.submit` picks
 * another DOM event, `__once` sends it once, `__case.kebab` keeps the key as written. The value is
 * an optional expression evaluated at send time, with `evt` in scope.
 */
export const track = attribute({
  name: 'track',
  key: 'required',
  mount({ el, mods, cased, value, evaluate, listen, report }) {
    const name = cased('pascal');
    const type = mods.get('event')?.[0] ?? 'click';
    listen(el, type, (evt: Event) => send(name, value ? evaluate(evt) : undefined).catch(report), {
      once: mods.has('once'),
    });
  },
});

/** `@track('Checkout', { total: $total })` from any expression; returns the promise from `send`. */
export const trackFunction = action({
  name: 'track',
  call: ({ error }, name: string, props?: Props) => {
    if (!name) throw error('needs an event name');
    return send(name, props);
  },
});

/**
 * Server event `sigmx-track`: `name Purchase` and an optional `props {"total": 42}` line, so the
 * server records a goal from the one place that knows it happened.
 */
export const trackHandler = handler({
  name: 'track',
  handle: (_, { name, props }) => {
    if (name) send(name, props ? JSON.parse(props) : undefined);
  },
});

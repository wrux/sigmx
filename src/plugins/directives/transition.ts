import { toMs } from '../../kernel/index.js';
import { dir } from '../def.js';

/**
 * Shows and hides with a fade: `transition="$open"`. Modifier: `__duration.200ms`.
 */
export const transition = dir('transition', 6, ({ el, mods, evaluate, effect }) => {
  const style = (el as HTMLElement).style;
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : toMs(mods.get('duration'), 200);
  const hidden = { opacity: 0 };
  const shown = { opacity: 1 };
  const initial = style.display === 'none' ? '' : style.display;
  let anim: Animation | undefined;
  let first = true;
  let last: boolean | undefined;
  effect(() => {
    const open = !!evaluate();
    if (open === last) return; // a dependency changed but the outcome did not: leave the element alone
    last = open;
    anim?.cancel();
    if (first || !el.animate) {
      first = false;
      style.display = open ? initial : 'none';
      return;
    }
    if (open) style.display = initial;
    anim = el.animate(open ? [hidden, shown] : [shown, hidden], { duration, easing: 'ease-out', fill: 'forwards' });
    anim.onfinish = () => {
      anim?.cancel();
      if (!open) style.display = 'none';
    };
  });
});

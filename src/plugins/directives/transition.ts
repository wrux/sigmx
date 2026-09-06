import { attribute, toMs } from '../../kernel/index.js'

/**
 * Shows and hides with a fade (and optional scale): `transition="$open"`.
 * Modifiers: `__duration.200ms`, `__scale` (from 95%) or `__scale.90`, `__origin.top`.
 */
export const transition = attribute({
  name: 'transition',
  key: 'forbidden',
  value: 'required',
  mount({ el, mods, evaluate, effect }) {
    const style = (el as HTMLElement).style
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : toMs(mods.get('duration'), 200)
    const scale = mods.has('scale') ? +(mods.get('scale')?.[0] ?? 95) / 100 : 1
    const origin = mods.get('origin')?.join(' ')
    if (origin) style.transformOrigin = origin
    const hidden = { opacity: 0, transform: `scale(${scale})` }
    const shown = { opacity: 1, transform: 'scale(1)' }
    const initial = style.display === 'none' ? '' : style.display
    let anim: Animation | undefined
    let first = true
    let last: boolean | undefined
    effect(() => {
      const open = !!evaluate()
      if (open === last) return // a dependency changed but the outcome did not: leave the element alone
      last = open
      anim?.cancel()
      if (first) {
        first = false
        style.display = open ? initial : 'none'
        return
      }
      if (open) style.display = initial
      anim = el.animate(open ? [hidden, shown] : [shown, hidden], { duration, easing: 'ease-out', fill: 'forwards' })
      anim.onfinish = () => {
        anim?.cancel()
        if (!open) style.display = 'none'
      }
    })
  },
})

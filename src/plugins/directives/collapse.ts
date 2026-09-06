import { attribute, toMs } from '../../kernel/index.js'

/**
 * Animates the element's height open and closed: `collapse="$open"`.
 * Modifiers: `__duration.250ms`, `__min.40px` (collapsed height, default 0).
 */
export const collapse = attribute({
  name: 'collapse',
  key: 'forbidden',
  value: 'required',
  mount({ el, mods, evaluate, effect, cleanup }) {
    const style = (el as HTMLElement).style
    const ms = toMs(mods.get('duration'), 250)
    const min = mods.get('min')?.[0] ?? '0px'
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches
    let timer: ReturnType<typeof setTimeout> | undefined
    let first = true
    const settle = (open: boolean) => {
      style.transition = ''
      style.overflow = open ? '' : 'hidden'
      style.height = open ? '' : min
    }
    effect(() => {
      const open = !!evaluate()
      clearTimeout(timer)
      if (first || instant) {
        first = false
        return settle(open)
      }
      const from = `${el.getBoundingClientRect().height}px`
      style.overflow = 'hidden'
      style.height = open ? min : from
      void el.getBoundingClientRect() // commit the start height before transitioning
      style.transition = `height ${ms}ms ease`
      style.height = open ? `${el.scrollHeight}px` : min
      timer = setTimeout(() => settle(open), ms + 20)
    })
    cleanup(() => clearTimeout(timer))
  },
})

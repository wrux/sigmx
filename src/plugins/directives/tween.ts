import { attribute, toMs } from '../../kernel/index.js'

const easings: Record<string, (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
}
const num = (s: string) => /^\s*(-?\d*\.?\d+)([a-z%]*)\s*$/i.exec(s)

/**
 * `animate:opacity="$open ? 1 : 0"` tweens a numeric CSS property (or attribute, for SVG) from its
 * current value to the expression's value whenever the expression changes.
 * Modifiers: `__duration.300ms`, `__easing.ease-in-out`. Non-numeric values apply immediately.
 */
export const animate = attribute({
  name: 'animate',
  key: 'required',
  value: 'required',
  mount({ el, mods, cased, evaluate, effect, cleanup }) {
    const prop = cased('kebab')
    const css = CSS.supports(prop, 'inherit')
    const duration = toMs(mods.get('duration'), 300)
    const ease = easings[mods.get('easing')?.[0] ?? 'ease-out'] ?? easings['ease-out']
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches
    const read = () => (css ? getComputedStyle(el).getPropertyValue(prop) : (el.getAttribute(prop) ?? ''))
    const write = (v: string) => (css ? el.style.setProperty(prop, v) : el.setAttribute(prop, v))
    let frame = 0
    let first = true
    effect(() => {
      const to = String(evaluate())
      cancelAnimationFrame(frame)
      const from = num(read())
      const target = num(to)
      if (first || instant || !from || !target || from[2] !== target[2]) {
        first = false
        return write(to)
      }
      const a = +from[1]
      const b = +target[1]
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration)
        write(`${a + (b - a) * ease(p)}${target[2]}`)
        if (p < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    cleanup(() => cancelAnimationFrame(frame))
  },
})

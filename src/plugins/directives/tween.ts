import { attribute, toMs } from '../../kernel/index.js'

const easings: Record<string, (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
}
const num = (s: string): { n: number; unit: string } | undefined => {
  const m = /^\s*(-?\d*\.?\d+)([a-z%]*)\s*$/i.exec(s)
  return m ? { n: +m[1], unit: m[2] } : undefined
}

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
    // Prefer the inline value (which this directive wrote last time); computed styles report px only.
    const read = () => (css ? el.style.getPropertyValue(prop) || getComputedStyle(el).getPropertyValue(prop) : (el.getAttribute(prop) ?? ''))
    const write = (v: string) => (css ? el.style.setProperty(prop, v) : el.setAttribute(prop, v))
    let frame = 0
    let first = true
    let last: string | undefined
    effect(() => {
      const to = String(evaluate())
      if (to === last) return
      last = to
      cancelAnimationFrame(frame)
      let from = num(read())
      const target = num(to)
      // A px start and a % target are common for width/height: convert against the parent box.
      if (from && target && from.unit === 'px' && target.unit === '%' && (prop === 'width' || prop === 'height') && el.parentElement) {
        const size = prop === 'width' ? el.parentElement.clientWidth : el.parentElement.clientHeight
        if (size) from = { n: (from.n / size) * 100, unit: '%' }
      }
      if (first || instant || !from || !target || from.unit !== target.unit) {
        first = false
        return write(to)
      }
      const a = from.n
      const b = target.n
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration)
        write(`${a + (b - a) * ease(p)}${target.unit}`)
        if (p < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    cleanup(() => cancelAnimationFrame(frame))
  },
})

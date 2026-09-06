import { attribute, withTiming, withViewTransition } from '../../kernel/index.js'

/** Runs when the element enters the viewport. Modifiers: once, exit, full, half, threshold.N. */
export const onIntersect = attribute({
  name: 'on-intersect',
  key: 'forbidden',
  value: 'required',
  returns: false,
  mount({ el, mods, evaluate }) {
    const t = mods.get('threshold')?.[0]
    const threshold = mods.has('full') ? 1 : mods.has('half') ? 0.5 : t ? Math.min(100, Math.max(0, +t)) / 100 : 0
    const run = withTiming(withViewTransition(() => evaluate(), mods), mods)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting === mods.has('exit')) continue
          run()
          if (mods.has('once')) io.disconnect()
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  },
})

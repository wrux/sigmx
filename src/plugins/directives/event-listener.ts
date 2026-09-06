import { attribute, withTiming, withViewTransition } from '../../kernel/index.js'

/**
 * `on:click="expr"`. Modifiers: window, document, outside, prevent, stop, capture, passive, once,
 * delay/debounce/throttle, viewtransition, case.
 */
export const on = attribute({
  name: 'on',
  key: 'required',
  value: 'required',
  returns: false,
  mount({ el, mods, cased, evaluate, listen }) {
    const type = cased('kebab')
    const outside = mods.has('outside')
    const target: EventTarget =
      mods.has('window') ? window : mods.has('document') || outside || type.startsWith('sigmx-') ? document : el
    const run = withTiming(withViewTransition((e: Event) => evaluate(e), mods), mods)
    listen(
      target,
      type,
      (e: Event) => {
        if (outside && el.contains(e.target as Node)) return
        if (mods.has('prevent') || (type === 'submit' && el instanceof HTMLFormElement)) e.preventDefault()
        if (mods.has('stop')) e.stopPropagation()
        run(e)
      },
      { capture: mods.has('capture'), passive: mods.has('passive'), once: mods.has('once') },
    )
  },
})

import { attribute } from '../../kernel/index.js'

const pick = (mods: Map<string, string[]>, names: string[], fallback: string) =>
  names.find((n) => mods.has(n)) ?? fallback

/** Scrolls the element into view on mount. Modifiers: smooth/instant/auto, vstart..vnearest, hstart..hnearest, focus. */
export const scrollIntoView = attribute({
  name: 'scroll-into-view',
  key: 'forbidden',
  value: 'forbidden',
  mount({ el, mods }) {
    el.scrollIntoView({
      behavior: pick(mods, ['smooth', 'instant', 'auto'], 'smooth') as ScrollBehavior,
      block: pick(mods, ['vstart', 'vcenter', 'vend', 'vnearest'], 'vcenter').slice(1) as ScrollLogicalPosition,
      inline: pick(mods, ['hstart', 'hcenter', 'hend', 'hnearest'], 'hcenter').slice(1) as ScrollLogicalPosition,
    })
    if (mods.has('focus')) (el as HTMLElement).focus?.()
  },
})

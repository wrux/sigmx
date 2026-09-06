import { attribute } from '../../kernel/index.js'

export const viewTransition = attribute({
  name: 'view-transition',
  key: 'forbidden',
  value: 'required',
  mount: ({ el, evaluate, effect }) => effect(() => el.style.setProperty('view-transition-name', String(evaluate()))),
})

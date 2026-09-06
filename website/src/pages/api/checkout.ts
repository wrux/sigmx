import type { APIRoute } from 'astro'
import { json, patchElements, patchSignals, readSignals, sse } from 'sigmx-astro/server'

export const prerender = false
export const catalogue = { kettle: 34.5, teapot: 22, cups: 18 }

const validate = (step: number, o: any): Record<string, string> => {
  const e: Record<string, string> = {}
  if (step === 1 && !Object.values(o.qty ?? {}).some((n: any) => Number(n) > 0)) e.qty = 'Pick at least one item.'
  if (step === 2) {
    if (!/^\S+@\S+\.\S+$/.test(o.email ?? '')) e.email = 'That email does not look right.'
    if (String(o.address ?? '').trim().length < 6) e.address = 'Please enter a full address.'
  }
  if (step === 3 && !/^\d{16}$/.test(String(o.card ?? '').replace(/\s/g, ''))) e.card = 'A card number has 16 digits (any digits will do here).'
  return e
}

/** Validates the current step; on success advances `step`, on the last step renders a receipt. */
export const POST: APIRoute = async ({ request }) => {
  const { step = 1, order = {} } = await readSignals(request)
  const errors = validate(Number(step), order)
  if (Object.keys(errors).length) return json({ errors, submitting: false })
  if (Number(step) < 3) return json({ errors: {}, step: Number(step) + 1, submitting: false })
  const lines = Object.entries(order.qty ?? {}).filter(([, q]) => Number(q) > 0).map(([k, q]) => `<li>${q} × ${k}</li>`).join('')
  const total = Object.entries(order.qty ?? {}).reduce((s, [k, q]) => s + Number(q) * (catalogue as any)[k], 0)
  return sse(
    patchElements(`<div id="receipt"><h4>Order confirmed</h4><ul>${lines}</ul><p>Total <b>${total.toFixed(2)} EUR</b>, receipt sent to ${order.email}.</p></div>`),
    patchSignals({ step: 4, submitting: false, order: { card: null } }),   // never keep the card number around
  )
}

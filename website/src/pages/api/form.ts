import type { APIRoute } from 'astro'
import { patchElements, patchSignals, readSignals, sse } from 'sigmx-astro/server'

export const prerender = false

// A tiny Standard Schema validator; Zod, Valibot and ArkType plug into readSignals the same way.
const schema = {
  '~standard': {
    validate: (v: any) => {
      const issues = []
      if (!/^\S+@\S+\.\S+$/.test(v?.email ?? '')) issues.push({ message: 'Enter a valid email address.' })
      if (String(v?.message ?? '').length < 5) issues.push({ message: 'The message needs at least five characters.' })
      return issues.length ? { issues } : { value: { email: String(v.email), message: String(v.message) } }
    },
  },
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email } = await readSignals(request, schema)
    return sse(
      patchElements(`<p id="form-status">Thanks, we will write to <b>${email}</b>.</p>`),
      patchSignals({ sent: true }),
    )
  } catch (e: any) {
    const msgs = (e.issues ?? [{ message: e.message }]).map((i: any) => `<li>${i.message}</li>`).join('')
    return sse(patchElements(`<div id="form-status" class="error"><ul>${msgs}</ul></div>`))
  }
}

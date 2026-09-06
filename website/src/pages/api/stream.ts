import type { APIRoute } from 'astro'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { sseStream } from 'sigmx-astro/server'
import JobLine from '../../components/partials/JobLine.astro'

export const prerender = false
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const steps = ['Fetching records…', 'Validating…', 'Transforming…', 'Writing output…', 'Done.']

export const GET: APIRoute = async () => {
  const container = await AstroContainer.create()
  return sseStream(async (s) => {
    s.patchSignals({ running: true, progress: 0 })
    s.patchElements('<ul id="job-log"></ul>')
    for (const [i, step] of steps.entries()) {
      await sleep(400)
      s.patchSignals({ progress: Math.round(((i + 1) / steps.length) * 100) })
      s.patchElements(await container.renderToString(JobLine, { props: { line: step } }), { selector: '#job-log', mode: 'append' })
    }
    s.patchSignals({ running: false })
  })
}

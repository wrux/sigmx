import type { APIRoute } from 'astro'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { patchElements, sse } from 'sigmx-astro/server'
import FeedPage from '../../components/examples/feed/FeedPage.astro'
import { PAGE_SIZE, TOTAL, page } from '../../data/feed'

export const prerender = false
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const GET: APIRoute = async ({ url }) => {
  const p = Number(url.searchParams.get('page') ?? 1)
  await sleep(500) // pretend this took a while
  const container = await AstroContainer.create()
  const items = await container.renderToString(FeedPage, { props: { posts: page(p) } })
  const last = (p + 1) * PAGE_SIZE >= TOTAL
  const sentinel = last
    ? '<p id="feed-sentinel" class="sentinel">That is everything. ✨</p>'
    : `<div id="feed-sentinel" class="sentinel" data-on-intersect__once="@get('/api/feed?page=${p + 1}')" data-indicator:loading><div class="skeleton" data-show="$loading"><i></i><i></i><i></i></div></div>`
  return sse(patchElements(items, { selector: '#feed', mode: 'append' }), patchElements(sentinel))
}

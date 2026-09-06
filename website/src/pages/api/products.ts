import type { APIRoute } from 'astro'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { patchElements, patchSignals, readSignals, sse } from 'sigmx-astro/server'
import ProductTable from '../../components/examples/table/ProductTable.astro'
import { products } from '../../data/products'

export const prerender = false
export const PAGE = 8

export const GET: APIRoute = async ({ request }) => {
  const { q = '', sort = 'name', dir = 'asc', page = 1 } = await readSignals(request)
  const term = String(q).toLowerCase()
  const rows = products
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.category.includes(term))
    .sort((a: any, b: any) => (a[sort] > b[sort] ? 1 : a[sort] < b[sort] ? -1 : 0) * (dir === 'desc' ? -1 : 1))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const current = Math.min(Math.max(1, Number(page)), pages)
  const container = await AstroContainer.create()
  const table = await container.renderToString(ProductTable, { props: { rows: rows.slice((current - 1) * PAGE, current * PAGE), sort, dir } })
  return sse(patchElements(table), patchSignals({ page: current, pages, total: rows.length }))
}

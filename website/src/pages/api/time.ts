import type { APIRoute } from 'astro'
import { html } from 'sigmx-astro/server'

export const prerender = false
export const GET: APIRoute = () =>
  html(`<span id="server-time">${new Date().toLocaleTimeString('en-GB')}</span>`)

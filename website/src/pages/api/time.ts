import { html } from '@sigmx/astro/server';
import type { APIRoute } from 'astro';

export const prerender = false;
export const GET: APIRoute = () => html(`<span id="server-time">${new Date().toLocaleTimeString('en-GB')}</span>`);

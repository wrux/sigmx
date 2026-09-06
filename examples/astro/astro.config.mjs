import node from '@astrojs/node';
import sigmx from '@sigmx/astro';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  vite: { plugins: [tailwindcss()] },
  integrations: [
    // Auto mode picks the plugins the templates use; precompile turns every expression into a
    // function at build time so the page never calls `new Function`. Every expression here is
    // static markup the scan can see, so the runtime compiler is left out of the bundle too.
    sigmx({ plugins: 'auto', precompile: { fallback: false } }),
  ],
});

import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import node from '@astrojs/node'
import sigmx from 'sigmx-astro'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [
    sigmx({ plugins: 'all', eventPrefix: ['sigmx-', 'datastar-'], precompile: true }),
    starlight({
      title: 'sigmx',
      description: 'A small hypermedia library: declarative attributes, signals, streaming server patches. Zero dependencies.',
      customCss: ['./src/styles/custom.css'],
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap' } },
      ],
      sidebar: [
        { label: 'Start here', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Examples', items: [{ autogenerate: { directory: 'examples' } }] },
        { label: 'Directives', items: [{ autogenerate: { directory: 'reference/directives' } }] },
        { label: 'Functions', items: [{ autogenerate: { directory: 'reference/functions' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference/api' } }] },
        { label: 'SDKs', items: [{ autogenerate: { directory: 'sdks' } }] },
      ],
    }),
  ],
})

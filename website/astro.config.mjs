import node from '@astrojs/node';
import starlight from '@astrojs/starlight';
import sigmx from '@sigmx/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://sigmx.dev',
  adapter: node({ mode: 'standalone' }),
  redirects: {
    '/guides/auto-mode/': '/tooling/auto-mode/',
    '/guides/precompiled-expressions/': '/tooling/precompiled-expressions/',
    '/guides/bundle-sizes/': '/tooling/bundle-sizes/',
    '/guides/csp/': '/tooling/csp/',
    '/guides/plugins/': '/extending/',
  },
  integrations: [
    sigmx({
      plugins: 'auto',
      auto: {
        always: ['jsonSignals'],
        custom: {
          track: 'src/plugins/plausible.ts',
          trackFunction: 'src/plugins/plausible.ts',
          trackHandler: 'src/plugins/plausible.ts',
        },
      },
      eventPrefix: ['sigmx-', 'datastar-'],
      precompile: true,
    }),
    starlight({
      title: 'sigmx',
      logo: { light: './src/assets/logo-light.svg', dark: './src/assets/logo-dark.svg', alt: '' },
      favicon: '/favicon.svg',
      description:
        'A small hypermedia library: declarative attributes, signals, streaming server patches. Zero dependencies.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/wrux/sigmx' }],
      editLink: { baseUrl: 'https://github.com/wrux/sigmx/edit/main/website/' },
      customCss: ['./src/styles/custom.css'],
      head: [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' } },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#23262f' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://sigmx.dev/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://sigmx.dev/og.png' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap',
          },
        },
      ],
      sidebar: [
        { label: 'Start here', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Build tooling', items: [{ autogenerate: { directory: 'tooling' } }] },
        { label: 'Extending', items: [{ autogenerate: { directory: 'extending' } }] },
        { label: 'Examples', items: [{ autogenerate: { directory: 'examples' } }] },
        { label: 'Directives', items: [{ autogenerate: { directory: 'reference/directives' } }] },
        { label: 'Functions', items: [{ autogenerate: { directory: 'reference/functions' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference/api' } }] },
        { label: 'SDKs', items: [{ autogenerate: { directory: 'sdks' } }] },
      ],
    }),
  ],
});

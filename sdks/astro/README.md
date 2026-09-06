# sigmx-astro

Astro integration and server helpers for [sigmx](../../README.md).

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import sigmx from 'sigmx-astro'

export default defineConfig({ integrations: [sigmx()] })
```

```ts
// src/pages/api/hello.ts
import { readSignals, sseStream } from 'sigmx-astro/server'
export const prerender = false
export const GET = async ({ request }) => {
  const { name } = await readSignals(request)
  return sseStream(async (s) => {
    s.patchSignals({ greeting: `hello ${name}` })
    s.patchElements(`<p id="out">hello ${name}</p>`)
  })
}
```

See the docs site in `website/` for the full guide.

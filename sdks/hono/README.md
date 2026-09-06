# @sigmx/hono

Hono middleware for [sigmx](https://github.com/wrux/sigmx). One `app.use(sigmx())` and every handler gets `c.var.sigmx`: the signals the request carries, and responses the client knows how to apply.

```bash
npm install sigmx @sigmx/hono
```

```ts
import { Hono } from 'hono';
import { patchElements, patchSignals, sigmx } from '@sigmx/hono';
import { serveClient } from '@sigmx/hono/node';

const app = new Hono();
app.use(sigmx());
app.get('/sigmx.js', serveClient()); // the script-tag build from node_modules; skip it if you bundle

app.get('/api/towns', async (c) => {
  const { q = '' } = await c.var.sigmx.signals();
  return c.var.sigmx.events(patchElements(renderTowns(q)), patchSignals({ stale: false }));
});

app.get('/api/progress', (c) =>
  c.var.sigmx.stream(async (s) => {
    for (let step = 1; step <= 10 && !s.closed; step++) {
      await s.sleep(150);
      await s.patchSignals({ progress: step * 10 });
    }
  }),
);
```

## `c.var.sigmx`

| member | |
|---|---|
| `isRequest` | true when the sigmx client made the request, so a route can return a partial instead of a whole page |
| `signals()` | the signals: `sigmx` query parameter on GET and DELETE, JSON body otherwise, form fields for `contentType: 'form'` requests |
| `signals(schema)` | the same, validated by any [Standard Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType…) and typed from it |
| `html(body, { selector, mode, useViewTransition, status })` | HTML the client morphs by id, or into `selector` with `mode`. Plain `c.html()` already works when you morph by id |
| `json(signals, { onlyIfMissing, status })` | JSON the client merges into its signals |
| `events(...events)` | several patches in one response, sent at once |
| `stream(fn)` | a long-lived stream; `fn` gets a `SigmxStream` with `patchElements`, `patchSignals`, `removeElements`, `removeSignals`, `executeScript`, `sleep`, `closed` and `onAbort`. Built on Hono's `streamSSE`, so it stops when the client disconnects |

Event builders (`patchElements`, `patchSignals`, `removeElements`, `removeSignals`, `executeScript`) and `formatEvent` are exported for use with `events()` or your own transport.

## Validation failures

`signals(schema)` throws a `SignalsError` (a Hono `HTTPException`) with the issues. Hono answers it with a JSON body and a 422 (400 when the payload could not be parsed) and logs nothing. To answer differently:

```ts
app.use(sigmx({ onError: (error, c) => c.text(error.message, 422) }));
```

If you define your own `app.onError`, return `error.getResponse()` for `HTTPException`s as usual.

## Serving the client

`serveClient()` from `@sigmx/hono/node` reads `sigmx.standalone.js` from the installed `sigmx` package and serves it with an ETag and `cache-control`. It needs a filesystem, so it is a separate entry for Node, Bun and Deno; on Workers, bundle the client with your app instead. Pass `{ file, maxAge }` to serve another file from sigmx's `dist` or change the cache lifetime.

## JSX

Hono's JSX passes namespaced attributes through, and every helper accepts a JSX node wherever it takes markup:

```tsx
const Counter = () => <button data-on:click="$count++">Clicked <b data-text="$count">0</b> times</button>;

app.get('/', (c) => c.html(<Counter />));
app.get('/api/rows', async (c) => c.var.sigmx.events(patchElements(<Rows q={String((await c.var.sigmx.signals()).q)} />)));
```

JSX attribute names may contain colons but not dots, so a modifier with an argument such as `data-on:input__debounce.200ms` is spread from an object: `<input {...{ 'data-on:input__debounce.200ms': "@get('/api/towns')" }} />`.

## Licence

MIT

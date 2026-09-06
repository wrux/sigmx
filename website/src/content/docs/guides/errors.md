---
title: "Error handling"
description: "What happens when an expression throws, and how to observe it."
sidebar: { order: 9 }
---

Every attribute mounts inside its own error boundary. A syntax error, a thrown exception in an event handler, or an effect that fails is reported and the rest of the page keeps mounting and reacting.

```ts
createSigmx({
  plugins,
  onError: (error, { plugin, el, attr }) => {
    console.warn(`${attr} on`, el, error)
    telemetry.capture(error, { plugin })
  },
})
```

The default handler is `console.error`. Errors thrown by an expression carry the failing source; errors from plugins have a message prefixed with the attribute name, for example `data-on: needs a key, e.g. :name`.

## Common messages

| message | cause |
|---|---|
| `needs a key` / `does not take a key` | the directive's key requirement was violated |
| `needs a value` / `does not take a value` | the directive's value requirement was violated |
| `unknown action @name` | the function is not registered; add its plugin |
| `"x" is a computed signal and cannot be assigned` | an expression wrote to a `data-computed` path |
| `effect loop` | an effect writes a signal it reads; use `@peek` or restructure |
| `@get needs a URL` | the first argument was empty |
| `no form found` | `contentType: 'form'` outside a form and without `selector` |

## Requests

Failed requests do not throw into your markup. They emit `sigmx-fetch` with `type: 'error'` and `status` or `message`, and `type: 'retrying'` while the retry policy runs. Listen with `data-on:sigmx-fetch__document="…"` or from JavaScript.

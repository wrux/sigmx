---
title: "DOM events"
description: "Events sigmx dispatches on document."
sidebar: {"order": 4}
---

| event | detail | when |
|---|---|---|
| `sigmx-signal-patch` | the nested patch, `null` for removals | after each settled batch of signal changes |
| `sigmx-fetch` | `{ el, type, method, url, rid }` with `type` of `started`, `finished`, `error`; `rid` identifies one request across its events. `error` adds the HTTP `status` or the network error's `message`; `finished` adds the final response's `url`, `status` and `redirected` (the same fields the request's promise resolves with) | request lifecycle |
| `sigmx-prop-change` | (bubbles from the element) | the morph changed an input's value, checked or selected state; `bind` listens for it |
| `sigmx-server-event` | `{ el, event, data }` | every named event received on a stream, before handlers run |

Listen from markup with `data-on:sigmx-fetch="…"` (events named `sigmx-*` listen on `document` automatically) or from JavaScript with `document.addEventListener`.

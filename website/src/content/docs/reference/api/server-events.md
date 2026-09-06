---
title: "Server events"
description: "The event-stream protocol and the built-in handlers."
sidebar: {"order": 5}
---

Responses with `Content-Type: text/event-stream` are read event by event. Each event's data lines are `key value` pairs; a repeated key joins its values with newlines.

## patch-signals

```
event: sigmx-patch-signals
data: onlyIfMissing true
data: signals {"user": {"name": "Ada"}, "draft": null}
```

Merged into the store with JSON merge-patch semantics. Computed paths are skipped.

## patch-elements

```
event: sigmx-patch-elements
data: selector #list
data: mode append
data: elements <li id="row-9">
data: elements   <b>new</b>
data: elements </li>
```

| field | default | |
|---|---|---|
| `elements` | | HTML; repeat the line for each line of markup |
| `selector` | | CSS selector for the target(s); without it, top-level elements are matched by `id` |
| `mode` | `outer` | `outer` morph, `inner` morph children, `replace`, `prepend`, `append`, `before`, `after`, `remove` |

A full document (`<html>`, `<head>` or `<body>` present) is morphed into the current document.

## Reconnection

`id:` lines are stored and sent as `Last-Event-ID` when reconnecting; `retry:` sets the delay. Reconnection happens after network errors (with backoff) and, with `reconnect: true`, after a stream closes normally.

## Custom events

Any other event name is looked up among registered handlers after stripping an accepted `eventPrefix`, and is also dispatched as `sigmx-server-event` on `document`.

## Plain responses

`text/html` and `application/json` responses are treated as a single `patch-elements` or `patch-signals` event; the response headers `sigmx-selector`, `sigmx-mode` and `sigmx-only-if-missing` supply the fields.

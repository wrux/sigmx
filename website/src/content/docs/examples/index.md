---
title: "Examples"
description: "Feature-rich, server-backed examples: a streaming chat agent, a live dashboard, a checkout wizard, an infinite feed and a data table."
sidebar: { order: 0, label: "Overview" }
---

Each example is a real application slice: an Astro component on this page talking to an endpoint written with the `sigmx-astro` SDK. The full source of both is shown under every demo. Together they use nearly every directive and function in the library.

| example | what it shows |
|---|---|
| [Chat agent](/examples/chat/) | streamed replies morphed word by word, Enter-to-send, typing indicator, a stop endpoint, tool-call cards through a custom server event, auto-scroll, a persisted draft |
| [Live dashboard](/examples/dashboard/) | a long-lived event stream with reconnect and `Last-Event-ID`, animated gauges via `@fit` and `animate`, threshold classes, `@intl` formatting, a rolling history kept by `on-signal-patch` |
| [Checkout wizard](/examples/checkout/) | a multi-step form validated per step on the server, computed totals, the step kept in the URL with history, a persisted draft, client-side validity |
| [Infinite feed](/examples/feed/) | an intersection-observer sentinel that loads pages the server appends, with a loading indicator and relative timestamps |
| [Data table](/examples/table/) | server-driven sort, filter and pagination, state synced to the query string, debounced search, focus-preserving morphs |

All of the server code runs in this site's Astro endpoints; nothing talks to a third-party service, and the "agent" is a canned responder so the demo needs no API key.

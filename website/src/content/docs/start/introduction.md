---
title: "Introduction"
description: "What sigmx is, how to say it, and where it comes from."
sidebar: { order: 1 }
---

sigmx is htmx on steroids in a tiny runtime. Like htmx, your server renders HTML and the browser swaps it in; a plain `text/html` response is all a backend needs to return. Unlike htmx, the page also has **signals** it can read, write and bind to, the swaps are morphs that keep focus and typed input, and when you want them, updates can stream over one connection. You write `data-*` attributes; there is no component model, no virtual DOM and no client-side router. The whole thing, every plugin included, is smaller than htmx alone and within a few hundred bytes of Datastar's free bundle, with more than twice its plugins.

## The name

Pronounced **"sigma x"**. Sigma stands for signals, the reactive values that hold client state (and, if you like, for summing state up into a page). The `x` is a nod to the family it belongs to: htmx-style libraries that treat HTML as the application. Write it in lowercase, `sigmx`, like `htmx`.

## Inspiration

Three libraries shaped it.

- **htmx** established the model: the server sends HTML, the browser swaps it in, and Server-Sent Events carry updates. sigmx keeps that model and its streaming protocol.
- **Alpine.js** showed that declarative attributes with a little reactivity can replace a framework for most interface work. sigmx's attribute syntax, modifiers and expression style come from that tradition.
- **Datastar** fused the two ideas into one library. sigmx started as a study of Datastar and shares its attribute vocabulary, so markup written for it usually runs unchanged. Everything under the hood was then written from scratch with different goals: a smaller and simpler codebase, plugins you register rather than side effects that register themselves, and an attribute prefix you can change at runtime for migrations.

## Principles

1. **Register what you use.** The core is a factory. Every attribute, function and server-event handler is a value you pass in, so your bundler only ships what you registered.
2. **Plain JavaScript expressions.** `$count++`, `$user.name`, `$items.push(x)` are not a DSL; they run as JavaScript with `$names` resolved against the store.
3. **One store, patched like JSON.** State is a tree addressed by dotted paths. The server patches it with JSON merge-patch semantics: objects merge, `null` removes.
4. **Errors stay local.** A broken expression on one element reports through `onError` and never stops the rest of the page from mounting.
5. **No dependencies.** Not at runtime, and only `esbuild` and `typescript` to build.

## What is in the box

| area | what you get |
|---|---|
| core | `createSigmx()`, the signal store, the expression compiler, the mutation observer that mounts attributes |
| directives | 27 attributes: `signals`, `text`, `on`, `bind`, `show`, `class`, `style`, `attr`, `computed`, `effect`, `ref`, `init`, timers, observers, `persist`, `query-string`, `animate` and more |
| functions | `@get` `@post` `@put` `@patch` `@delete`, `@peek`, `@setAll`, `@toggleAll`, `@fit`, `@clipboard`, `@intl` |
| server events | `patch-signals`, `patch-elements` with an id-aware DOM morph |
| SDKs | an Astro integration with server helpers for streaming responses |

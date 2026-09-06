---
title: "Introduction"
description: "The problem sigmx solves, the goal behind it, where it comes from, and what is in the box."
sidebar: { order: 1 }
---

sigmx is a hypermedia framework with a small reactive runtime. Your server renders HTML and the browser asks for more of it; the page holds its own state in signals; updates arrive as HTML or as a stream of patches and are morphed in without losing focus, typed input or scroll position. You write `data-*` attributes. There is no component model, no virtual DOM and no client-side router, and the whole runtime, every plugin included, is smaller than htmx alone.

## The problem

Building for the web today means choosing between two bargains.

A modern framework gives you reactive state, components, routing and data fetching, and charges for it up front: tens of kilobytes of JavaScript parsed and executed before the first line of your own code runs, a second rendering model on the client that has to agree with the one on the server, and a build that every page depends on. The result is powerful and, for most sites, far more than the page needs.

A hypermedia library goes the other way. htmx is a few kilobytes and lets the server do what it is good at, but everything that happens *between* requests is left to you: a search box with a debounce, a form with a live total, a menu that closes on Escape, a field that stays typed-into while the list under it refreshes. Those needs are real, so a second library gets bolted on for client state, then extensions for both, and the total is no longer small or simple.

## The goal

sigmx is an attempt to have the first bargain's power at the second bargain's price. Its goals, in order:

1. **A runtime the browser barely notices.** The core is 4.5 KB brotli; a typical page with server requests, signals, forms and the morph is about 9 KB; every plugin together is 11.5 KB, less than htmx on its own. Precompiling expressions takes the core to 3.8 KB.
2. **Powerful enough to build real applications.** Streaming responses, a morph that keeps state, two-way binding for every input type, computed values, effects, persisted and URL-synced state, animation, WebSocket, boosted navigation, and the plugins people otherwise bolt on to Alpine and htmx.
3. **The build does the work.** A scanner reads your source and registers exactly the plugins it uses. A precompiler turns every attribute expression into a function at build time, so the browser never compiles anything and a strict Content-Security-Policy needs no exceptions. Both run as a CLI for any build, a Vite plugin for any framework, an Astro integration and a Rust crate.
4. **Any server, any language.** The protocol is HTML over HTTP and a text event stream. A backend in Go, Python, Rust, PHP, Elixir or JavaScript speaks it by writing a response; helper packages exist for JavaScript runtimes, Astro, Hono and Rust, and none of them is required.
5. **Easy to extend.** Every built-in is a plain object made with the same three helpers you get: `attribute()`, `action()` and `handler()`. Your plugins are scanned, precompiled and torn down exactly like the built-ins.
6. **Something you can leave alone.** Zero dependencies, semantic versioning on a documented surface, and a feature audit that fails the build when a behaviour disappears. See [Stability](/guides/stability/).

## The name

Pronounced **"sigma x"**. Sigma stands for signals, the reactive values that hold client state (and, if you like, for summing state up into a page). The `x` is a nod to the family it belongs to: htmx-style libraries that treat HTML as the application. Write it in lowercase, `sigmx`, like `htmx`.

## Inspiration

Three libraries shaped it.

- **htmx** established the model: the server sends HTML, the browser swaps it in, and Server-Sent Events carry updates. sigmx keeps that model and its streaming protocol.
- **Alpine.js** showed that declarative attributes with a little reactivity can replace a framework for most interface work. sigmx's attribute syntax, modifiers and expression style come from that tradition.
- **Datastar** fused the two ideas into one library. sigmx started as a study of Datastar and shares its attribute vocabulary, so markup written for it usually runs unchanged. Everything under the hood was then written from scratch with different goals: a smaller and simpler codebase, plugins you register rather than side effects that register themselves, a build that chooses and compiles for you, and an attribute prefix you can change at runtime for migrations.

## Principles

1. **Register what you use.** The core is a factory. Every attribute, function and server-event handler is a value you pass in, so your bundler only ships what you registered, and [auto mode](/tooling/auto-mode/) can pass them in for you.
2. **Plain JavaScript expressions.** `$count++`, `$user.name`, `$items.push(x)` are not a DSL; they run as JavaScript with `$names` resolved against the store, whether compiled in the browser or at build time.
3. **One store, patched like JSON.** State is a tree addressed by dotted paths. The server patches it with JSON merge-patch semantics: objects merge, `null` removes.
4. **Errors stay local.** A broken expression on one element reports through `onError` and never stops the rest of the page from mounting.
5. **No dependencies.** Not at runtime, and only `esbuild` and `typescript` to build.

## What is in the box

| area | what you get |
|---|---|
| core | `createSigmx()`, the signal store, the expression compiler, the mutation observer that mounts attributes |
| directives | `signals`, `text`, `on`, `bind`, `show`, `class`, `style`, `attr`, `computed`, `effect`, `ref`, `init`, timers, observers, `persist`, `query-string`, `animate`, `transition`, `collapse`, `mask`, `teleport`, `boost` and more: 34 in all |
| functions | `@get` `@post` `@put` `@patch` `@delete`, `@ws`, `@peek`, `@setAll`, `@toggleAll`, `@fit`, `@clipboard`, `@intl`, `@dispatch`, `@confirm` |
| server events | `patch-signals`, `patch-elements` with an id-aware DOM morph |
| build tooling | auto mode, precompiled expressions, a CLI and a Vite plugin: see [Build tooling](/tooling/) |
| server side | a protocol any language can speak, `sigmx/server` for JavaScript runtimes, and SDKs for [Astro](/sdks/astro/), [Hono](/sdks/hono/) and [Rust](/sdks/rust/) |

## Where next

- [Installation](/start/installation/) and [your first app](/start/first-app/) get a page talking to a server in a few minutes.
- The [examples](/examples/) are complete application slices with their server code: a streaming chat agent, a live dashboard, a checkout wizard, an infinite feed and a data table.
- [Build tooling](/tooling/) explains how the scanner and precompiler keep the runtime small.
- [Extending](/extending/) shows how to write your own directives, functions and server events, ending with a complete analytics plugin.

---
name: Bug report
about: Something behaves differently from the documentation
labels: bug
---

## What happened

A clear description of the behaviour you saw.

## What you expected

What the documentation says should happen, with a link to the page if there is one.

## Reproduction

The smallest markup and server response that shows the problem. A single HTML file, a repository, or a snippet like:

```html
<div data-signals="{ n: 0 }">
  <button data-on:click="$n++">…</button>
</div>
```

## Environment

- sigmx version (and `@sigmx/astro`, `@sigmx/hono` or the Rust crate, if used):
- How the client is loaded (bundler, script tag, auto mode, precompiled expressions):
- Browser and version:
- Anything reported through `onError` or in the console:

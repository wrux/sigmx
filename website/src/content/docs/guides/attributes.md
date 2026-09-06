---
title: "Attribute syntax"
description: "Plugin names, keys, modifiers, casing, evaluation order and how to opt an element out."
sidebar: { order: 1 }
---

Every sigmx attribute has the same shape:

```
data-<plugin>[:key][__modifier[.argument]...]="expression"
```

| part | example | meaning |
|---|---|---|
| plugin | `data-text` | which directive handles the attribute |
| key | `data-on:click`, `data-class:active`, `data-signals:user.name` | a name the directive needs: an event, a class, a signal path |
| modifiers | `__debounce.300ms`, `__prevent`, `__case.kebab` | options, each with optional dot-separated arguments; a decimal argument such as `__debounce.1.5s` is read as one number |
| expression | `"$count * 2"` | JavaScript evaluated by the directive |

Examples:

```html
<button data-on:click__debounce.300ms__prevent="@post('/save')">Save</button>
<div data-signals:user.name__ifmissing="'anon'"></div>
<li data-class:is-active="$page === 3"></li>
<input data-bind:search__event.change>
```

## Keys and casing

HTML lowercases attribute names before sigmx ever sees them, so `data-bind:newTodo` arrives as `data-bind:newtodo`. Write multi-word keys in kebab-case: keys that name signals are converted to camelCase, so `data-bind:new-todo` binds `newTodo`. Change that with `__case.kebab`, `__case.snake` or `__case.pascal`. A leading underscore is kept, so `data-bind:_draft` binds `_draft` (the convention for browser-only state that requests leave out). Keys that name events or CSS classes keep kebab-case.

Dotted keys address nested paths: `data-signals:user.address.city="'Bath'"` creates `user.address.city`.

## Evaluation order

Attributes mount in document order, and within one element in attribute order. Two consequences:

1. Declare signals before the elements that read them. Reading an undefined signal gives `undefined`, and the reader re-runs once the signal appears, so the order is a matter of tidiness, not correctness.
2. A directive that restores state, such as `persist` or `query-string`, runs when it is reached. Declare defaults with `__ifmissing` so a later `data-signals` does not overwrite the restored value.

## Opting out

`data-ignore` on an element skips it and its whole subtree, for every configured prefix.

## Prefixes

The default prefix is `data-`. Configure another, or several at once, to run existing markup unchanged:

```ts
createSigmx({ plugins, prefix: ['data-', 'hx-', 's-'] })
```

`hx-on:click`, `s-text` and `data-text` then all work on the same page. See [Migration](/guides/migration/).

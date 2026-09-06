---
title: "Content Security Policy"
description: "Running sigmx on pages that forbid eval: the nonce compiler, and precompiling as the way to need no compiler at all."
sidebar: { order: 6 }
---

Expressions compile with `new Function` by default, which a strict `script-src` policy without `'unsafe-eval'` blocks. There are two ways to run under such a policy.

## Precompile and ship no compiler

[Precompiled expressions](/tooling/precompiled-expressions/) turn every literal attribute expression into a function at build time, so the browser looks expressions up and never compiles anything. That removes the need for a runtime compiler of any kind: no `'unsafe-eval'`, no nonce, no Trusted Types policy, and 749 bytes brotli less in the bundle. With `fallback: false` the compiler is not bundled at all. This is the option to prefer when your templates are static.

## The nonce compiler

For markup assembled at runtime, sigmx ships an alternative compiler that turns each expression into a nonce-bearing inline `<script>` instead of calling `new Function`, and creates a Trusted Types policy named `sigmx` when the page enforces one.

```ts
import { createSigmx } from 'sigmx'
import { cspCompiler } from 'sigmx/csp'

createSigmx({ plugins, compile: cspCompiler(document.documentElement.dataset.nonce) })
```

Your policy must allow the nonce (`script-src 'nonce-…'`) and, with Trusted Types, permit a policy named `sigmx` (`trusted-types sigmx`). The policy is created once per page, since a second policy with the same name throws under a strict CSP. Each expression is compiled by appending a `<script nonce>` to `<head>` and removing it once it has run; compiled functions are cached by source and parameter list, so each distinct expression injects one script. `cspCompiler` throws `cspCompiler needs the page nonce` when called without one, and compilation throws `the Content-Security-Policy blocked expression compilation` when the policy rejected the script.

The CSP compiler costs about 200 bytes brotli (175 bytes on the core, 204 on the minimal preset) and is not included unless you import it. It also serves as the compiler plugins reach through `ctx.compiler`; the only built-in that does is `patch-signals`, and only for a payload that is not valid JSON, which the server helpers never send.

The two approaches combine: look up what the build saw and compile the rest through the nonce.

```ts
import { createRuntime, precompiled, runtimeExpressions } from 'sigmx'
import { cspCompiler } from 'sigmx/csp'
import { table } from 'virtual:sigmx-expressions'

const compile = cspCompiler(document.documentElement.dataset.nonce)
createRuntime({ plugins, compile, expressions: precompiled(table, runtimeExpressions(compile)) })
```

---
title: "Content Security Policy"
description: "Running sigmx on pages that forbid eval."
sidebar: { order: 8 }
---

Expressions compile with `new Function` by default, which a strict `script-src` policy without `'unsafe-eval'` blocks. sigmx ships an alternative compiler that turns each expression into a nonce-bearing inline script instead, and uses a Trusted Types policy when the page enforces one.

```ts
import { createSigmx } from 'sigmx'
import { cspCompiler } from 'sigmx/csp'

createSigmx({ plugins, compile: cspCompiler(document.documentElement.dataset.nonce) })
```

Your policy must allow the nonce (`script-src 'nonce-…'`) and, with Trusted Types, permit a policy named `sigmx` (`trusted-types sigmx`). Compiled functions are cached, so each distinct expression injects one script.

The CSP compiler costs about 200 bytes gzipped and is not included unless you import it.

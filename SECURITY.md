# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's security advisories for this repository: open https://github.com/wrux/sigmx/security/advisories/new and describe the issue, the affected package and version, and how to reproduce it. Do not open a public issue for a security problem.

You will get an acknowledgement, a fix or a mitigation, and credit in the release notes if you want it. Please allow time for a fix to ship before disclosing publicly.

## Scope

- The client: the `sigmx` npm package, its plugins, presets, the standalone build and the precompiler.
- The server helpers in `sigmx/server`.
- The SDKs: `@sigmx/astro`, `@sigmx/hono` and the `sigmx` Rust crate.

Vulnerabilities in the example applications or the documentation site are welcome reports too, though they are not shipped to users.

## What sigmx does and does not protect against

Attribute expressions are JavaScript that runs in the page with the page's authority, so treat them as you treat any inline script: never build them from untrusted input. On pages with a strict Content-Security-Policy, the `sigmx/csp` compiler avoids `new Function`. `data-html` sets `innerHTML` without sanitising; only use it with markup you trust.

Hardening already in place:

- Signal patches and paths cannot reach `Object.prototype`: `__proto__`, `constructor` and `prototype` segments are ignored by the store, so a hostile `patch-signals` payload cannot pollute prototypes.
- The server helpers split multi-line values into separate `data:` lines and strip newlines from event `id` and `event` fields, so no value can inject a field or an event into a stream.
- Requests from the client are marked with the `Sigmx-Request: true` header; server-side checks should rely on your own authentication, not on that header alone.

Each item has a regression test in `tests/unit/hardening.test.mjs` or `tests/dom/hardening.test.mjs`.

## Supported versions

Fixes are released for the latest minor version of each package.

# Releasing

Three packages publish from this repository: `sigmx` first, then `@sigmx/astro` and `@sigmx/hono` (both peer-depend on `sigmx`).

```bash
# 1. sigmx
npm run check && npm test && npm run size          # everything green, note the sizes for the changelog
npm version patch                                   # or minor; creates the tag
npm publish                                         # prepack builds dist; prepublishOnly re-runs check + test

# 2. @sigmx/astro
cd sdks/astro
npm version patch
npm publish

# 3. @sigmx/hono
cd ../hono
npm version patch
npm publish

# 4. push commits and tags
git push --follow-tags
```

Before the first publish: `npm login`, and confirm `npm view <name>` returns 404 (`sigmx` and `@sigmx/astro` were free on 6 September 2026 and are now published; `@sigmx/hono` is not yet). The SDKs import `sigmx/server`, so whenever the core gains or changes a server export, release it first and raise the SDKs' `peerDependencies.sigmx` to that version before publishing them. `@sigmx/hono` 0.1.0 was published against the wrong range; after 0.1.1 run `npm deprecate @sigmx/hono@0.1.0 "needs sigmx >= 0.1.1"`.

After a release that the examples depend on, run `npm install` in `examples/hono` and `examples/express` so their lockfiles pick up the published version.

`npm pack --dry-run` in any of the three directories lists exactly what would ship: `dist/`, `README.md`, `LICENSE` and `package.json`.

# Releasing

Three packages publish from this repository: `sigmx` first, then `@sigmx/astro` and `@sigmx/hono` (both peer-depend on `sigmx`).

```bash
# 1. sigmx
npm run check && npm test && npm run size          # everything green, note the sizes for the changelog
npm version 0.1.0                                   # or patch/minor; creates the tag v0.1.0
npm publish                                         # prepack builds dist; prepublishOnly re-runs check + test

# 2. @sigmx/astro
cd sdks/astro
npm version 0.1.0
npm publish

# 3. @sigmx/hono
cd ../hono
npm version 0.1.0
npm publish

# 4. push commits and tags
git push --follow-tags
```

Before the first publish: `npm login`, and confirm `npm view <name>` returns 404 (`sigmx` and `@sigmx/astro` were free on 6 September 2026 and are now published; `@sigmx/hono` is not yet). `examples/hono` depends on `@sigmx/hono`, and `examples/express` on `sigmx` (for `sigmx/server`), through `file:` links until the next publish; switch both to caret ranges afterwards.

`npm pack --dry-run` in any of the three directories lists exactly what would ship: `dist/`, `README.md`, `LICENSE` and `package.json`.

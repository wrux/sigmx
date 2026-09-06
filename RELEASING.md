# Releasing

Both packages publish from this repository; `sigmx` first, then `sigmx-astro` (it peer-depends on `sigmx`).

```bash
# 1. sigmx
npm run check && npm test && npm run size          # everything green, note the sizes for the changelog
npm version 0.1.0                                   # or patch/minor; creates the tag v0.1.0
npm publish                                         # prepack builds dist; prepublishOnly re-runs check + test

# 2. sigmx-astro
cd sdks/astro
npm version 0.1.0
npm publish

# 3. push commits and tags
git push --follow-tags
```

Before the first publish: `npm login`, and confirm `npm view sigmx` and `npm view sigmx-astro` return 404 (both names were free on 6 September 2026).

`npm pack --dry-run` in either directory lists exactly what would ship: `dist/`, `README.md`, `LICENSE` and `package.json`.

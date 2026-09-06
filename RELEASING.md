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

All three packages are published (`sigmx`, `@sigmx/astro`, `@sigmx/hono`). When the versions were already bumped by hand in the release commit (as for 0.2.0), skip `npm version` and tag instead: `git tag v0.2.0 && git push --follow-tags`. The SDKs import `sigmx/server`, so whenever the core gains or changes a server export, release it first and raise the SDKs' `peerDependencies.sigmx` to that version before publishing them. `@sigmx/hono` 0.1.0 was published against the wrong range; after 0.1.1 run `npm deprecate @sigmx/hono@0.1.0 "needs sigmx >= 0.1.1"`.

After a release that the examples depend on, run `npm install` in `examples/hono` and `examples/express` so their lockfiles pick up the published version.

`npm publish` publishes the directory it runs in and ignores `--prefix`, so change into each SDK directory first. `npm pack --dry-run` in any of the three directories lists exactly what would ship: `dist/`, `README.md`, `LICENSE` and `package.json`.

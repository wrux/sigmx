# sigmx on Cloudflare Workers

An axum router compiled to wasm32 with [workers-rs](https://github.com/cloudflare/workers-rs), and a client built without Node: a small Rust program (`assetc/`) unpacks the sigmx modules embedded in the crate, scans the maud templates for the directives in use, and writes the entry module wrangler serves as a static asset.

```bash
cargo install worker-build
npx wrangler dev        # runs the [build] command: assetc, then worker-build
```

What to look at:

- `src/lib.rs`: `ReadSignals<T>` for the search signals and the form, `Sse::events` for two patches in one response, `Sse::run` for a streamed progress bar (`worker::send::SendFuture` makes the Worker future `Send` for axum's body).
- `assetc/src/main.rs`: `sigmx::client::write_esm`, `sigmx::scan::scan`, `Entry::module`.
- `assets/js/shout.js`: a custom directive auto mode picks up from `data-shout` in the templates.

Only the modules the page uses are loaded, straight from `public/vendor/sigmx/`; a project with its own bundler (swc, esbuild, Vite) bundles `public/sigmx.js` into one file instead.

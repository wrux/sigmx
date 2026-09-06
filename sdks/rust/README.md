# sigmx (Rust)

The Rust SDK for [sigmx](https://github.com/wrux/sigmx): read the signals a request carries, answer with HTML, JSON or a stream of patches, and ship the client from a build that has no Node in it. It runs on native servers and on Cloudflare Workers (`wasm32-unknown-unknown`).

```toml
[dependencies]
sigmx = { version = "0.2", features = ["axum"] }
```

```rust
use axum::{routing::get, Router};
use maud::html;
use serde::Deserialize;
use sigmx::axum::{serve_client, ReadSignals, Sse};
use sigmx::prelude::*;

#[derive(Deserialize)]
struct Search { q: String }

async fn search(ReadSignals(s): ReadSignals<Search>) -> Sse {
    Sse::events([
        PatchElements::new(html! { ul id="towns" { li { (s.q) } } }).into_event(),
        PatchSignals::new(r#"{"searching":false}"#).into_event(),
    ])
}

let app = Router::new()
    .route("/search", get(search))
    .route("/sigmx.js", get(serve_client));
```

```html
<script type="module" src="/sigmx.js"></script>
<input data-bind:q data-on:input__debounce.200ms="@get('/search')" />
<ul id="towns"></ul>
```

## What is in the crate

| module | feature | |
|---|---|---|
| `sigmx` | always | `Event`, `PatchElements`, `PatchSignals`, `ExecuteScript`, `PatchMode`; `html()`, `json()`, `sse()` response descriptions; no dependencies |
| `sigmx::{read_signals, parse_signals, SignalsError}` | `json` (default) | the request side: the `sigmx` query parameter, a JSON body, or form fields, into `serde_json` or your own `Deserialize` type |
| `sigmx::axum` | `axum` | `ReadSignals<T>` and `IsSigmxRequest` extractors, `IntoResponse` for every builder, `Sse` (fixed, stream, channel, or a future that writes as it runs), `serve_client`. Does not enable axum's `tokio` feature, so it builds for wasm32 |
| `sigmx::worker` | `worker` | the same for handlers written against `worker::Request` and `worker::Response`; streams accept non-`Send` futures |
| `sigmx::http` | `http` | `http::Response<String>` from every builder and `read_signals` from `http::request::Parts`, for anything else built on the `http` crate |
| `sigmx::client` | `client` (default) | the client embedded from the same release: `STANDALONE` (the script-tag build) and `FILES` (the ES module tree), `write_standalone`, `write_esm`, `ETAG` |
| `sigmx::scan` | `scan` | auto mode: scan `.rs`, `.html` and template files for the directives and functions in use, select the plugins, generate the entry module |
| `sigmx` binary | `cli` | the two above from the command line |
| `sigmx::stream` | `stream` | the runtime-free `SseWriter` and event streams the framework modules build on |

Every builder takes markup as anything that converts into a `String`, so `maud::Markup` (and askama's or your own rendered strings) go straight in.

## Reading signals

GET and DELETE requests carry signals in the `sigmx` query parameter, other methods in a JSON body, and `@post(url, { contentType: 'form' })` requests as form fields (a repeated name becomes an array; values stay strings). `ReadSignals<T>` deserialises into `T`; a payload that cannot be parsed answers 400, one that does not match `T` answers 422, both with a JSON body, the same as the JavaScript SDK. `Option<ReadSignals<T>>` is `None` when the request did not come from the sigmx client, so one route can serve a page to a browser navigation and a partial to sigmx.

## Responding

```rust
html(markup)                                     // morphed by id
html(row).selector("#rows").mode(PatchMode::Append)   // targeted with the sigmx-selector and sigmx-mode headers
json(json!({ "count": 3 }))                       // merged into the signals
sse([PatchElements::new(list).into_event(), PatchSignals::new(r#"{"stale":false}"#).into_event()])
PatchElements::new(markup)                       // a single event is a response too, under axum
```

Streams need no runtime of their own. `Sse::run` polls the handler's future while the response body is read, `Sse::channel` hands you a writer for a task or a broadcast, `Sse::stream` takes any `Stream<Item = Event>`:

```rust
async fn progress() -> Sse {
    Sse::run(|s| async move {
        for step in 1..=10 {
            tokio::time::sleep(Duration::from_millis(150)).await;
            if !s.patch_signals(format!(r#"{{"progress":{}}}"#, step * 10)) { return; } // client gone
        }
    })
}
```

## Cloudflare Workers

The `axum` module builds for wasm32 as it is, so a Worker that routes with axum (through `worker`'s `axum` feature) uses the same handlers. Worker futures are not `Send`; wrap a streaming handler's future in `worker::send::SendFuture`, or write the handler against `worker::Request` and use `sigmx::worker::run`, which takes a plain future. [examples/worker](examples/worker) is a complete Worker with its client built by cargo alone.

## The client without Node

Every release of the crate embeds the client of the same version, so a Rust project never needs npm to get it:

```bash
cargo install sigmx --features cli
sigmx client standalone public/sigmx.js      # every plugin, 12 KB brotli: <script type="module" src="/sigmx.js">
sigmx client unpack public/vendor/sigmx      # the ES modules, for a bundle of your own
sigmx entry src --from ./vendor/sigmx --out public/sigmx.js   # auto mode: an entry registering only what src/ uses
```

The same three calls are functions (`client::write_standalone`, `client::write_esm`, `scan::scan` + `scan::Entry`) for a project with its own Rust asset step, like the `assetc` crate in the Worker example. The generated entry imports from the unpacked tree with relative paths, so a browser can load it as-is, and swc, esbuild or Vite can bundle it into one file. Custom plugins are picked up by name: `--custom shout=assets/js/shout.js` (or `Options::custom`) reads `attribute({ name: 'shout', … })` from the file without running it and imports it when `data-shout` appears in the scanned source.

Projects that do have a bundler can also install `sigmx` from npm and use `sigmx/vite`; the crate's server side does not care where the client came from.

## Coming from the Datastar SDK

The types line up: `datastar::prelude::*` becomes `sigmx::prelude::*`, `DatastarEvent` is `Event`, `PatchElements::new(html).into()` and `PatchSignals::new(json).into()` are unchanged, and `Display` still renders the wire format. Then update what the client sends: the request header is `sigmx-request` (was `datastar-request`) and the GET query parameter is `sigmx` (was `datastar`), which `ReadSignals` and `is_sigmx_request` already handle. Events are named `sigmx-patch-*`; while a client still accepts both, `createSigmx({ eventPrefix: ['sigmx-', 'datastar-'] })` keeps old backends working. `use_view_transition` has no equivalent and is dropped.

## Licence

MIT

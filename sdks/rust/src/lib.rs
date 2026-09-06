//! Rust SDK for [sigmx](https://github.com/wrux/sigmx).
//!
//! The protocol is small: a request from the client carries its signals and a `sigmx-request`
//! header; the server answers with HTML (morphed by id), JSON (merged into the signals) or a
//! `text/event-stream` of patches. This crate has three layers:
//!
//! - **Protocol**, always available and dependency-free: [`Event`], [`PatchElements`],
//!   [`PatchSignals`], [`ExecuteScript`], the response builders [`html`], [`json`] and [`sse`],
//!   and with the `json` feature the request side ([`read_signals`], [`parse_signals`]).
//! - **Frameworks**, feature-gated: [`axum`](crate::axum) (no tokio dependency, so it builds for
//!   `wasm32-unknown-unknown`), [`worker`](crate::worker) for Cloudflare Workers, and
//!   [`http`](crate::http) for anything built on the `http` crate.
//! - **Client tooling**, for Rust projects without Node: the embedded client in
//!   [`client`](crate::client) and the auto-mode scanner in [`scan`](crate::scan), also
//!   available as the `sigmx` binary (`cargo install sigmx --features cli`).
//!
//! ```
//! use sigmx::prelude::*;
//!
//! let body = sse([
//!     PatchElements::new("<ul id=\"towns\"><li>Banbury</li></ul>").into_event(),
//!     PatchSignals::new(r#"{"stale":false}"#).into_event(),
//! ]);
//! assert!(body.body.starts_with("event: sigmx-patch-elements\n"));
//! ```
#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod event;
mod jsonfmt;
mod response;

pub use event::{
    format_events, ElementPatchMode, Event, ExecuteScript, PatchElements, PatchMode, PatchSignals,
    EVENT_PATCH_ELEMENTS, EVENT_PATCH_SIGNALS, EVENT_PREFIX,
};
#[cfg(feature = "json")]
pub use response::json;
pub use response::{
    html, sse, HtmlResponse, JsonResponse, SseResponse, CONTENT_TYPE_HTML, CONTENT_TYPE_JAVASCRIPT,
    CONTENT_TYPE_JSON, CONTENT_TYPE_SSE, SSE_HEADERS,
};

#[cfg(feature = "json")]
mod signals;
#[cfg(feature = "json")]
pub use signals::{
    is_sigmx_request, parse_signals, read_signals, RawRequest, SignalsError, MODE_HEADER,
    ONLY_IF_MISSING_HEADER, REQUEST_HEADER, SELECTOR_HEADER, SIGNALS_KEY,
};

#[cfg(feature = "axum")]
pub mod axum;
#[cfg(feature = "client")]
pub mod client;
#[cfg(feature = "http")]
pub mod http;
#[cfg(feature = "scan")]
pub mod scan;
#[cfg(feature = "stream")]
pub mod stream;
#[cfg(feature = "worker")]
pub mod worker;

/// The names most handlers need.
pub mod prelude {
    pub use crate::{
        html, sse, ElementPatchMode, Event, ExecuteScript, HtmlResponse, JsonResponse,
        PatchElements, PatchMode, PatchSignals, SseResponse,
    };
    #[cfg(feature = "json")]
    pub use crate::{is_sigmx_request, json, read_signals, SignalsError};
}

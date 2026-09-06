//! Axum 0.8 integration: the [`ReadSignals`] extractor, responses for every builder, and
//! [`Sse`] for streams. Nothing here needs axum's `tokio` feature, so it builds for
//! `wasm32-unknown-unknown` (Cloudflare Workers through the `worker` crate's axum support).
//!
//! ```no_run
//! use axum::{routing::get, Router};
//! use serde::Deserialize;
//! use sigmx::axum::{ReadSignals, Sse};
//! use sigmx::prelude::*;
//!
//! #[derive(Deserialize)]
//! struct Search { q: String }
//!
//! async fn search(ReadSignals(s): ReadSignals<Search>) -> Sse {
//!     Sse::events([
//!         PatchElements::new(format!("<ul id=\"results\"><li>{}</li></ul>", s.q)).into_event(),
//!         PatchSignals::new(r#"{"searching":false}"#).into_event(),
//!     ])
//! }
//!
//! let app: Router = Router::new().route("/search", get(search));
//! ```

use crate::stream::{chunks, drive, BoxStream, SseWriter};
use crate::{
    Event, ExecuteScript, HtmlResponse, JsonResponse, PatchElements, PatchSignals, RawRequest,
    SignalsError, SseResponse, CONTENT_TYPE_JSON, REQUEST_HEADER, SSE_HEADERS,
};
use ::axum::body::{Body, Bytes};
use ::axum::extract::{FromRequest, FromRequestParts, OptionalFromRequest, Request};
use ::axum::http::request::Parts;
use ::axum::http::{header, HeaderMap, StatusCode};
use ::axum::response::{IntoResponse, Response};
use futures_core::Stream;
use serde::de::DeserializeOwned;
use std::convert::Infallible;
use std::future::Future;

/// Extracts the signals a request carries into `T`. Parse failures answer 400, type mismatches
/// 422, both with a JSON body. As an `Option<ReadSignals<T>>` it is `None` when the request did
/// not come from the sigmx client (no `sigmx-request` header).
#[derive(Debug, Clone)]
pub struct ReadSignals<T>(pub T);

impl<T, S> FromRequest<S> for ReadSignals<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = SignalsError;

    async fn from_request(req: Request, state: &S) -> Result<Self, SignalsError> {
        let (parts, body) = req.into_parts();
        let method = parts.method.as_str().to_owned();
        let content_type = parts
            .headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let query = parts.uri.query().map(str::to_owned);
        let bytes = Bytes::from_request(Request::from_parts(parts, body), state)
            .await
            .map_err(|e| SignalsError::bad_request(format!("could not read body: {e}")))?;
        let raw = RawRequest {
            method: &method,
            content_type: content_type.as_deref(),
            query: query.as_deref(),
            body: &bytes,
        };
        crate::read_signals(&raw).map(ReadSignals)
    }
}

impl<T, S> OptionalFromRequest<S> for ReadSignals<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = SignalsError;

    async fn from_request(req: Request, state: &S) -> Result<Option<Self>, SignalsError> {
        if !is_sigmx_request(req.headers()) {
            return Ok(None);
        }
        <Self as FromRequest<S>>::from_request(req, state)
            .await
            .map(Some)
    }
}

/// True when the sigmx client made the request, so a route can return a partial instead of a page.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IsSigmxRequest(pub bool);

impl<S: Send + Sync> FromRequestParts<S> for IsSigmxRequest {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Infallible> {
        Ok(IsSigmxRequest(is_sigmx_request(&parts.headers)))
    }
}

/// True when the sigmx client made the request.
pub fn is_sigmx_request(headers: &HeaderMap) -> bool {
    crate::is_sigmx_request(headers.get(REQUEST_HEADER).and_then(|v| v.to_str().ok()))
}

impl IntoResponse for SignalsError {
    fn into_response(self) -> Response {
        (
            StatusCode::from_u16(self.status).unwrap_or(StatusCode::BAD_REQUEST),
            [(header::CONTENT_TYPE, CONTENT_TYPE_JSON)],
            self.json_body(),
        )
            .into_response()
    }
}

fn with_headers(status: u16, headers: Vec<(&'static str, String)>, body: Body) -> Response {
    let mut res = Response::new(body);
    *res.status_mut() = StatusCode::from_u16(status).unwrap_or(StatusCode::OK);
    for (k, v) in headers {
        if let Ok(v) = v.parse() {
            res.headers_mut().insert(k, v);
        }
    }
    res
}

impl IntoResponse for HtmlResponse {
    fn into_response(self) -> Response {
        let headers = self.headers();
        with_headers(self.status, headers, Body::from(self.body))
    }
}
impl IntoResponse for JsonResponse {
    fn into_response(self) -> Response {
        let headers = self.headers();
        with_headers(self.status, headers, Body::from(self.body))
    }
}
impl IntoResponse for SseResponse {
    fn into_response(self) -> Response {
        with_headers(self.status, sse_headers(), Body::from(self.body))
    }
}
impl IntoResponse for Event {
    fn into_response(self) -> Response {
        crate::sse([self]).into_response()
    }
}
impl IntoResponse for PatchElements {
    fn into_response(self) -> Response {
        self.into_event().into_response()
    }
}
impl IntoResponse for PatchSignals {
    fn into_response(self) -> Response {
        self.into_event().into_response()
    }
}
impl IntoResponse for ExecuteScript {
    fn into_response(self) -> Response {
        self.into_event().into_response()
    }
}

fn sse_headers() -> Vec<(&'static str, String)> {
    SSE_HEADERS
        .iter()
        .map(|(k, v)| (*k, (*v).to_owned()))
        .collect()
}

/// An event-stream response: fixed events, a stream, a channel, or a future that writes as it runs.
///
/// ```no_run
/// use sigmx::axum::Sse;
/// use std::time::Duration;
///
/// async fn progress() -> Sse {
///     Sse::run(|s| async move {
///         for step in 1..=10 {
///             tokio::time::sleep(Duration::from_millis(150)).await;
///             if !s.patch_signals(format!(r#"{{"progress":{}}}"#, step * 10)) { break; }
///         }
///     })
/// }
/// ```
#[derive(Debug)]
pub struct Sse {
    body: Body,
}

impl Sse {
    /// Every event formatted up front, sent at once.
    pub fn events<I>(events: I) -> Self
    where
        I: IntoIterator,
        I::Item: Into<Event>,
    {
        Sse {
            body: Body::from(crate::format_events(events)),
        }
    }

    /// Stream events from any `Stream`.
    pub fn stream<S>(stream: S) -> Self
    where
        S: Stream<Item = Event> + Send + 'static,
    {
        let boxed: BoxStream = Box::pin(stream);
        Sse {
            body: Body::from_stream(chunks::<_, Infallible>(boxed)),
        }
    }

    /// Run `f`'s future while the response is read; it writes through the [`SseWriter`]. The
    /// stream ends when the future completes and every clone of the writer is dropped.
    ///
    /// On Cloudflare Workers the future is not `Send`; wrap it in `worker::send::SendFuture`, or
    /// use [`crate::worker::run`].
    pub fn run<F, Fut>(f: F) -> Self
    where
        F: FnOnce(SseWriter) -> Fut,
        Fut: Future<Output = ()> + Send + 'static,
    {
        Sse {
            body: Body::from_stream(chunks::<_, Infallible>(drive(f))),
        }
    }

    /// A stream and the writer that feeds it, for when the writing happens elsewhere (a spawned
    /// task, a broadcast subscription).
    pub fn channel() -> (SseWriter, Self) {
        let (w, rx) = crate::stream::channel();
        (
            w,
            Sse {
                body: Body::from_stream(chunks::<_, Infallible>(rx)),
            },
        )
    }
}

impl IntoResponse for Sse {
    fn into_response(self) -> Response {
        with_headers(200, sse_headers(), self.body)
    }
}

/// A handler serving the script-tag build with an ETag: `Router::new().route("/sigmx.js",
/// get(serve_client))`.
#[cfg(feature = "client")]
pub async fn serve_client(headers: HeaderMap) -> Response {
    let inm = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok());
    let (parts, body) = crate::http::client_response(inm).into_parts();
    Response::from_parts(parts, Body::from(body))
}

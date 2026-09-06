//! Cloudflare Workers integration for handlers written against `worker::Request` and
//! `worker::Response`. Projects that route with axum inside a Worker use [`crate::axum`] instead;
//! the streaming helpers here accept non-`Send` futures, which is what Worker code produces.

use crate::stream::{chunks, drive, LocalBoxStream, SseWriter};
use crate::{
    Event, HtmlResponse, JsonResponse, RawRequest, SignalsError, SseResponse, CONTENT_TYPE_JSON,
    REQUEST_HEADER, SSE_HEADERS,
};
use ::worker::{Error, Headers, Request, Response, ResponseBuilder, Result};
use futures_core::Stream;
use serde::de::DeserializeOwned;
use std::future::Future;

/// True when the sigmx client made the request.
pub fn is_sigmx_request(req: &Request) -> bool {
    crate::is_sigmx_request(req.headers().get(REQUEST_HEADER).ok().flatten().as_deref())
}

/// Read the signals the request carries into `T`.
pub async fn read_signals<T: DeserializeOwned>(
    req: &mut Request,
) -> std::result::Result<T, SignalsError> {
    let method = req.method().to_string();
    let content_type = req.headers().get("content-type").ok().flatten();
    let url = req
        .url()
        .map_err(|e| SignalsError::bad_request(format!("could not read url: {e}")))?;
    let upper = method.to_ascii_uppercase();
    let body = if upper == "GET" || upper == "DELETE" {
        Vec::new()
    } else {
        req.bytes()
            .await
            .map_err(|e| SignalsError::bad_request(format!("could not read body: {e}")))?
    };
    crate::read_signals(&RawRequest {
        method: &method,
        content_type: content_type.as_deref(),
        query: url.query(),
        body: &body,
    })
}

fn builder(status: u16, headers: &[(&str, String)]) -> Result<ResponseBuilder> {
    let h = Headers::new();
    for (k, v) in headers {
        h.set(k, v)?;
    }
    Ok(ResponseBuilder::new().with_status(status).with_headers(h))
}

fn sse_headers() -> Vec<(&'static str, String)> {
    SSE_HEADERS
        .iter()
        .map(|(k, v)| (*k, (*v).to_owned()))
        .collect()
}

/// A plain HTML response.
pub fn html(r: HtmlResponse) -> Result<Response> {
    Ok(builder(r.status, &r.headers())?.fixed(r.body.into_bytes()))
}

/// A plain JSON response.
pub fn json(r: JsonResponse) -> Result<Response> {
    Ok(builder(r.status, &r.headers())?.fixed(r.body.into_bytes()))
}

/// A fixed event-stream response.
pub fn sse(r: SseResponse) -> Result<Response> {
    Ok(builder(r.status, &sse_headers())?.fixed(r.body.into_bytes()))
}

/// Several events in one fixed response.
pub fn events<I>(events: I) -> Result<Response>
where
    I: IntoIterator,
    I::Item: Into<Event>,
{
    sse(crate::sse(events))
}

/// The JSON error response for a failed [`read_signals`].
pub fn error(e: &SignalsError) -> Result<Response> {
    Ok(
        builder(e.status, &[("content-type", CONTENT_TYPE_JSON.to_owned())])?
            .fixed(e.json_body().into_bytes()),
    )
}

/// Stream events from any `Stream`.
pub fn stream<S>(stream: S) -> Result<Response>
where
    S: Stream<Item = Event> + 'static,
{
    let boxed: LocalBoxStream = Box::pin(stream);
    builder(200, &sse_headers())?.from_stream(chunks::<_, Error>(boxed))
}

/// Run `f`'s future while the response is read; it writes through the [`SseWriter`].
pub fn run<F, Fut>(f: F) -> Result<Response>
where
    F: FnOnce(SseWriter) -> Fut,
    Fut: Future<Output = ()> + 'static,
{
    builder(200, &sse_headers())?.from_stream(chunks::<_, Error>(drive(f)))
}

/// A streaming response and the writer that feeds it.
pub fn channel() -> Result<(SseWriter, Response)> {
    let (w, rx) = crate::stream::channel();
    Ok((
        w,
        builder(200, &sse_headers())?.from_stream(chunks::<_, Error>(rx))?,
    ))
}

/// Serve the script-tag build with an ETag. Prefer writing it to your assets directory at build
/// time (`sigmx client standalone public/sigmx.js`) so the asset layer serves it without the Worker.
#[cfg(feature = "client")]
pub fn serve_client(req: &Request) -> Result<Response> {
    let inm = req.headers().get("if-none-match").ok().flatten();
    if crate::client::matches_etag(inm.as_deref()) {
        return Ok(builder(304, &[("etag", crate::client::ETAG.to_owned())])?.empty());
    }
    Ok(builder(
        200,
        &[
            ("content-type", crate::CONTENT_TYPE_JAVASCRIPT.to_owned()),
            ("etag", crate::client::ETAG.to_owned()),
            ("cache-control", crate::client::CACHE_CONTROL.to_owned()),
        ],
    )?
    .fixed(crate::client::STANDALONE.as_bytes().to_vec()))
}

//! Framework-neutral descriptions of the three response shapes. The `http`, `axum` and `worker`
//! modules turn them into real responses.

use crate::{format_events, Event, PatchMode};

/// `text/html; charset=utf-8`.
pub const CONTENT_TYPE_HTML: &str = "text/html; charset=utf-8";
/// `application/json`.
pub const CONTENT_TYPE_JSON: &str = "application/json";
/// `text/event-stream`.
pub const CONTENT_TYPE_SSE: &str = "text/event-stream";
/// `text/javascript; charset=utf-8`, for serving the client.
pub const CONTENT_TYPE_JAVASCRIPT: &str = "text/javascript; charset=utf-8";
/// Headers of an event-stream response.
pub const SSE_HEADERS: &[(&str, &str)] = &[
    ("content-type", CONTENT_TYPE_SSE),
    ("cache-control", "no-cache"),
];

/// A plain HTML response. The client morphs it by id, or into `selector` with `mode` when the
/// `sigmx-selector` and `sigmx-mode` headers are present.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HtmlResponse {
    /// The markup.
    pub body: String,
    /// Target selector, sent as the `sigmx-selector` header.
    pub selector: Option<String>,
    /// Patch mode, sent as the `sigmx-mode` header.
    pub mode: Option<PatchMode>,
    /// HTTP status (default 200).
    pub status: u16,
}

/// A plain HTML response; see [`HtmlResponse`]. Takes a `String`, `&str` or anything that
/// converts into one, such as `maud::Markup`.
pub fn html(body: impl Into<String>) -> HtmlResponse {
    HtmlResponse {
        body: body.into(),
        selector: None,
        mode: None,
        status: 200,
    }
}

impl HtmlResponse {
    /// Target the elements matching this CSS selector.
    pub fn selector(mut self, selector: impl Into<String>) -> Self {
        self.selector = Some(selector.into());
        self
    }
    /// Set the patch mode.
    pub fn mode(mut self, mode: PatchMode) -> Self {
        self.mode = Some(mode);
        self
    }
    /// Set the HTTP status.
    pub fn status(mut self, status: u16) -> Self {
        self.status = status;
        self
    }
    /// The headers to send.
    pub fn headers(&self) -> Vec<(&'static str, String)> {
        let mut h = vec![("content-type", CONTENT_TYPE_HTML.to_owned())];
        if let Some(s) = &self.selector {
            h.push(("sigmx-selector", s.clone()));
        }
        if let Some(m) = self.mode {
            h.push(("sigmx-mode", m.as_str().to_owned()));
        }
        h
    }
}

/// A JSON response the client merges into its signals.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonResponse {
    /// The JSON text.
    pub body: String,
    /// Keep values the client already has (the `sigmx-only-if-missing` header).
    pub only_if_missing: bool,
    /// HTTP status (default 200).
    pub status: u16,
}

/// A JSON response from a `serde_json::Value`; see [`JsonResponse`].
#[cfg(feature = "json")]
pub fn json(signals: serde_json::Value) -> JsonResponse {
    JsonResponse::new(signals.to_string())
}

impl JsonResponse {
    /// A JSON response from JSON text.
    pub fn new(json: impl Into<String>) -> Self {
        JsonResponse {
            body: json.into(),
            only_if_missing: false,
            status: 200,
        }
    }
    /// Keep values the client already has.
    pub fn only_if_missing(mut self, only_if_missing: bool) -> Self {
        self.only_if_missing = only_if_missing;
        self
    }
    /// Set the HTTP status.
    pub fn status(mut self, status: u16) -> Self {
        self.status = status;
        self
    }
    /// The headers to send.
    pub fn headers(&self) -> Vec<(&'static str, String)> {
        let mut h = vec![("content-type", CONTENT_TYPE_JSON.to_owned())];
        if self.only_if_missing {
            h.push(("sigmx-only-if-missing", "true".to_owned()));
        }
        h
    }
}

/// A fixed event-stream response: every event is formatted up front and sent at once.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseResponse {
    /// The formatted events.
    pub body: String,
    /// HTTP status (default 200).
    pub status: u16,
}

/// Several patches in one response; see [`SseResponse`]. Accepts events or the builders.
pub fn sse<I>(events: I) -> SseResponse
where
    I: IntoIterator,
    I::Item: Into<Event>,
{
    SseResponse {
        body: format_events(events),
        status: 200,
    }
}

impl SseResponse {
    /// Set the HTTP status.
    pub fn status(mut self, status: u16) -> Self {
        self.status = status;
        self
    }
    /// The headers to send.
    pub fn headers(&self) -> &'static [(&'static str, &'static str)] {
        SSE_HEADERS
    }
}

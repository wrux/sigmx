//! Responses as `http::Response<String>` and request reading from `http::request::Parts`, for
//! any framework built on the `http` crate.

use crate::{
    is_sigmx_request as header_is_sigmx, read_signals as read_raw, Event, HtmlResponse,
    JsonResponse, RawRequest, SignalsError, SseResponse, CONTENT_TYPE_JSON, REQUEST_HEADER,
};
use ::http::header::{HeaderMap, CONTENT_TYPE};
use ::http::request::Parts;
use ::http::{Response, StatusCode};
use serde::de::DeserializeOwned;

fn build(status: u16, headers: &[(&str, String)], body: String) -> Response<String> {
    let mut b = Response::builder().status(status);
    for (k, v) in headers {
        b = b.header(*k, v.as_str());
    }
    b.body(body).expect("valid response")
}

impl From<HtmlResponse> for Response<String> {
    fn from(r: HtmlResponse) -> Self {
        build(r.status, &r.headers(), r.body)
    }
}
impl From<JsonResponse> for Response<String> {
    fn from(r: JsonResponse) -> Self {
        build(r.status, &r.headers(), r.body)
    }
}
impl From<SseResponse> for Response<String> {
    fn from(r: SseResponse) -> Self {
        let headers: Vec<(&str, String)> = r
            .headers()
            .iter()
            .map(|(k, v)| (*k, (*v).to_owned()))
            .collect();
        build(r.status, &headers, r.body)
    }
}
impl From<Event> for Response<String> {
    fn from(e: Event) -> Self {
        crate::sse([e]).into()
    }
}
impl From<SignalsError> for Response<String> {
    fn from(e: SignalsError) -> Self {
        build(
            e.status,
            &[("content-type", CONTENT_TYPE_JSON.to_owned())],
            e.json_body(),
        )
    }
}

/// True when the sigmx client made the request.
pub fn is_sigmx_request(headers: &HeaderMap) -> bool {
    header_is_sigmx(headers.get(REQUEST_HEADER).and_then(|v| v.to_str().ok()))
}

/// The request parts that locate the signals.
pub fn raw_request<'a>(parts: &'a Parts, body: &'a [u8]) -> RawRequest<'a> {
    RawRequest {
        method: parts.method.as_str(),
        content_type: parts
            .headers
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()),
        query: parts.uri.query(),
        body,
    }
}

/// Read the signals from request parts and a body already read into memory.
pub fn read_signals<T: DeserializeOwned>(parts: &Parts, body: &[u8]) -> Result<T, SignalsError> {
    read_raw(&raw_request(parts, body))
}

/// The client as a response: the script-tag build with an ETag, or a 304 when `if_none_match`
/// already has it.
#[cfg(feature = "client")]
pub fn client_response(if_none_match: Option<&str>) -> Response<String> {
    if crate::client::matches_etag(if_none_match) {
        return build(
            StatusCode::NOT_MODIFIED.as_u16(),
            &[("etag", crate::client::ETAG.to_owned())],
            String::new(),
        );
    }
    build(
        200,
        &[
            ("content-type", crate::CONTENT_TYPE_JAVASCRIPT.to_owned()),
            ("etag", crate::client::ETAG.to_owned()),
            ("cache-control", crate::client::CACHE_CONTROL.to_owned()),
        ],
        crate::client::STANDALONE.to_owned(),
    )
}

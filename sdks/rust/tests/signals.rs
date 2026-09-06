//! Reading signals from the three places a request can carry them.

use serde::Deserialize;
use sigmx::{is_sigmx_request, parse_signals, read_signals, RawRequest};

#[derive(Deserialize, Debug, PartialEq)]
struct Search {
    q: String,
    #[serde(default)]
    page: u32,
}

fn get(query: &str) -> RawRequest<'static> {
    RawRequest {
        method: "GET",
        content_type: None,
        query: Some(Box::leak(query.to_owned().into_boxed_str())),
        body: &[],
    }
}

#[test]
fn get_reads_the_sigmx_query_parameter() {
    let raw = get("sigmx=%7B%22q%22%3A%22a%22%2C%22page%22%3A2%7D");
    assert_eq!(
        read_signals::<Search>(&raw).unwrap(),
        Search {
            q: "a".into(),
            page: 2
        }
    );
    // Lowercase methods and DELETE behave the same.
    let raw = RawRequest {
        method: "delete",
        ..get("sigmx=%7B%22q%22%3A%22z%22%7D")
    };
    assert_eq!(read_signals::<Search>(&raw).unwrap().q, "z");
}

#[test]
fn get_without_the_parameter_reads_plain_fields() {
    let raw = get("q=a+b&tag=x&tag=y");
    let m = parse_signals(&raw).unwrap();
    assert_eq!(m["q"], "a b");
    assert_eq!(m["tag"], serde_json::json!(["x", "y"]));
    assert!(parse_signals(&get("")).unwrap().is_empty());
}

#[test]
fn json_and_form_bodies() {
    let raw = RawRequest {
        method: "POST",
        content_type: Some("application/json; charset=utf-8"),
        query: None,
        body: br#"{"q":"n"}"#,
    };
    assert_eq!(read_signals::<Search>(&raw).unwrap().q, "n");
    let raw = RawRequest {
        method: "POST",
        content_type: Some("application/json"),
        query: None,
        body: b"",
    };
    assert!(parse_signals(&raw).unwrap().is_empty());
    let raw = RawRequest {
        method: "POST",
        content_type: Some("application/x-www-form-urlencoded"),
        query: None,
        body: b"q=who%20me&page=3",
    };
    let m = parse_signals(&raw).unwrap();
    assert_eq!(m["q"], "who me");
    assert_eq!(m["page"], "3", "form fields stay strings");
    let raw = RawRequest {
        method: "POST",
        content_type: Some("text/plain"),
        query: None,
        body: b"ignored",
    };
    assert!(parse_signals(&raw).unwrap().is_empty());
}

#[test]
fn failures_carry_the_status_the_javascript_sdk_uses() {
    let e = parse_signals(&get("sigmx=not-json")).unwrap_err();
    assert_eq!(e.status, 400);
    assert!(e.message.starts_with("could not parse signals"));
    assert_eq!(
        e.json_body(),
        format!(
            "{{\"error\":{}}}",
            serde_json::to_string(&e.message).unwrap()
        )
    );
    let e = parse_signals(&get("sigmx=%5B1%5D")).unwrap_err();
    assert_eq!(
        (e.status, e.message.as_str()),
        (400, "signals must be an object")
    );
    let e = read_signals::<Search>(&get("sigmx=%7B%7D")).unwrap_err();
    assert_eq!(e.status, 422);
    assert!(e.message.starts_with("invalid signals"));
    let raw = RawRequest {
        method: "POST",
        content_type: Some("multipart/form-data; boundary=x"),
        query: None,
        body: b"",
    };
    assert_eq!(parse_signals(&raw).unwrap_err().status, 400);
}

#[test]
fn request_header() {
    assert!(is_sigmx_request(Some("true")));
    assert!(is_sigmx_request(Some(" true ")));
    assert!(!is_sigmx_request(Some("1")));
    assert!(!is_sigmx_request(None));
}

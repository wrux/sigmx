//! The wire format, checked against the same strings the JavaScript SDK's tests assert.

use sigmx::prelude::*;
use std::time::Duration;

#[test]
fn patch_signals_with_id() {
    let e = PatchSignals::new(r#"{"a":1}"#).id("7").into_event();
    assert_eq!(
        e.to_string(),
        "id: 7\nevent: sigmx-patch-signals\ndata: signals {\"a\":1}\n\n"
    );
}

#[test]
fn multiline_markup_becomes_repeated_lines() {
    let e = PatchElements::new("<p>\n hi\n</p>")
        .selector("#x")
        .mode(PatchMode::Append)
        .into_event();
    assert_eq!(
        e.to_string(),
        "event: sigmx-patch-elements\ndata: selector #x\ndata: mode append\ndata: elements <p>\ndata: elements  hi\ndata: elements </p>\n\n"
    );
}

#[test]
fn crlf_and_trimming() {
    let e = PatchElements::new("  <p>a</p>\r\n<p>b</p>\n").into_event();
    assert_eq!(e.lines, vec!["elements <p>a</p>\r\n<p>b</p>"]);
    assert_eq!(
        e.to_string(),
        "event: sigmx-patch-elements\ndata: elements <p>a</p>\ndata: elements <p>b</p>\n\n"
    );
}

#[test]
fn remove_elements() {
    let e = PatchElements::remove("#toast").into_event();
    assert_eq!(e.lines, vec!["selector #toast", "mode remove"]);
    assert_eq!(PatchElements::new_remove("#toast").into_event(), e);
}

#[test]
fn remove_signals_builds_a_null_patch() {
    let e = PatchSignals::remove(["a.b", "c"]).into_event();
    assert_eq!(e.lines, vec![r#"signals {"a":{"b":null},"c":null}"#]);
    let e = PatchSignals::remove(["user.name", "user.email", "draft"]).into_event();
    assert_eq!(
        e.lines,
        vec![r#"signals {"draft":null,"user":{"email":null,"name":null}}"#]
    );
}

#[test]
fn only_if_missing_and_retry() {
    let e = PatchSignals::new("{}")
        .only_if_missing(true)
        .retry(Duration::from_millis(2500))
        .into_event();
    assert_eq!(
        e.to_string(),
        "retry: 2500\nevent: sigmx-patch-signals\ndata: onlyIfMissing true\ndata: signals {}\n\n"
    );
}

#[test]
fn execute_script() {
    let e = ExecuteScript::new("alert(1)").into_event();
    assert_eq!(
        e.lines,
        vec![
            "selector body",
            "mode append",
            "elements <script data-init=\"el.remove()\">alert(1)</script>"
        ]
    );
    let e = ExecuteScript::new("x()")
        .auto_remove(false)
        .attribute("type", "module")
        .attribute("data-x", "a\"b")
        .into_event();
    assert_eq!(
        e.lines[2],
        "elements <script type=\"module\" data-x=\"a&quot;b\">x()</script>"
    );
}

#[test]
fn custom_events_and_single_line_fields() {
    let e = Event::custom("toast").line("message", "Saved").id("a\nb");
    assert_eq!(
        e.to_string(),
        "id: a b\nevent: sigmx-toast\ndata: message Saved\n\n"
    );
    let e = Event::new("ping");
    assert_eq!(e.to_string(), "event: ping\n\n");
    let e = Event::new("x").line("flag", "");
    assert_eq!(e.to_string(), "event: x\ndata: flag \n\n");
}

#[test]
fn fixed_responses() {
    let r = sse([
        PatchSignals::new(r#"{"a":1}"#).into_event(),
        PatchElements::new("<b id=\"x\">x</b>").into_event(),
    ]);
    assert!(r.body.starts_with("event: sigmx-patch-signals\n"));
    assert_eq!(r.body.matches("event: ").count(), 2);
    assert_eq!(r.headers(), sigmx::SSE_HEADERS);

    let h = html("<b>x</b>").selector("#t").mode(PatchMode::Inner);
    assert_eq!(
        h.headers(),
        vec![
            ("content-type", "text/html; charset=utf-8".to_owned()),
            ("sigmx-selector", "#t".to_owned()),
            ("sigmx-mode", "inner".to_owned())
        ]
    );
    let j = json(serde_json::json!({ "a": 1 })).only_if_missing(true);
    assert_eq!(j.body, r#"{"a":1}"#);
    assert_eq!(j.headers()[1], ("sigmx-only-if-missing", "true".to_owned()));
}

#[test]
fn maud_markup_is_accepted_directly() {
    let e = PatchElements::new(maud::html! { p id="x" { "hi" } }).into_event();
    assert_eq!(e.lines, vec!["elements <p id=\"x\">hi</p>"]);
}

#[test]
fn builders_convert_from_references_and_values() {
    let p = PatchSignals::from_value(serde_json::json!({ "n": 2 }));
    let a: Event = (&p).into();
    let b: Event = p.into();
    assert_eq!(a, b);
    let _: Event = serde_json::json!({ "n": 2 }).into();
}

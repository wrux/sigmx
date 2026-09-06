//! The axum layer end to end: extractors, responses and streams through a `Router`.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use http_body_util::BodyExt;
use serde::Deserialize;
use sigmx::axum::{serve_client, IsSigmxRequest, ReadSignals, Sse};
use sigmx::prelude::*;
use std::time::Duration;
use tower::ServiceExt;

#[derive(Deserialize)]
struct Search {
    q: String,
}

async fn search(ReadSignals(s): ReadSignals<Search>) -> Sse {
    Sse::events([
        PatchElements::new(format!("<ul id=\"r\"><li>{}</li></ul>", s.q)).into_event(),
        PatchSignals::new(r#"{"searching":false}"#).into_event(),
    ])
}

async fn optional(
    IsSigmxRequest(is): IsSigmxRequest,
    signals: Option<ReadSignals<Search>>,
) -> String {
    format!(
        "{is} {}",
        signals.map(|s| s.0.q).unwrap_or_else(|| "-".into())
    )
}

async fn page() -> HtmlResponse {
    html("<b id=\"x\">x</b>")
        .selector("#t")
        .mode(PatchMode::Inner)
}

async fn count() -> JsonResponse {
    json(serde_json::json!({ "count": 3 })).only_if_missing(true)
}

async fn one() -> PatchElements {
    PatchElements::new("<p id=\"p\">one</p>")
}

async fn progress() -> Sse {
    Sse::run(|s| async move {
        for step in 1..=3 {
            tokio::time::sleep(Duration::from_millis(2)).await;
            s.patch_signals(format!(r#"{{"progress":{step}}}"#));
        }
    })
}

async fn channel() -> Sse {
    let (w, sse) = Sse::channel();
    tokio::spawn(async move {
        w.patch_elements("<p id=\"a\">a</p>");
        tokio::time::sleep(Duration::from_millis(2)).await;
        w.remove_elements("#a");
    });
    sse
}

async fn form(ReadSignals(s): ReadSignals<Search>) -> String {
    s.q
}

fn app() -> Router {
    Router::new()
        .route("/search", get(search))
        .route("/optional", get(optional))
        .route("/page", get(page))
        .route("/count", get(count))
        .route("/one", get(one))
        .route("/progress", get(progress))
        .route("/channel", get(channel))
        .route("/form", post(form))
        .route("/sigmx.js", get(serve_client))
}

async fn text(res: axum::response::Response) -> String {
    String::from_utf8(res.into_body().collect().await.unwrap().to_bytes().to_vec()).unwrap()
}

fn sigmx_get(uri: &str) -> Request<Body> {
    Request::get(uri)
        .header("sigmx-request", "true")
        .body(Body::empty())
        .unwrap()
}

#[tokio::test]
async fn events_from_signals() {
    let res = app()
        .oneshot(sigmx_get("/search?sigmx=%7B%22q%22%3A%22ban%22%7D"))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()[header::CONTENT_TYPE], "text/event-stream");
    assert_eq!(res.headers()[header::CACHE_CONTROL], "no-cache");
    assert_eq!(
        text(res).await,
        "event: sigmx-patch-elements\ndata: elements <ul id=\"r\"><li>ban</li></ul>\n\nevent: sigmx-patch-signals\ndata: signals {\"searching\":false}\n\n"
    );
}

#[tokio::test]
async fn rejections_are_json_with_the_right_status() {
    let res = app()
        .oneshot(sigmx_get("/search?sigmx=nope"))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    assert_eq!(res.headers()[header::CONTENT_TYPE], "application/json");
    assert!(text(res)
        .await
        .starts_with("{\"error\":\"could not parse signals"));
    let res = app()
        .oneshot(sigmx_get("/search?sigmx=%7B%7D"))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn optional_extractor_and_request_flag() {
    let res = app()
        .oneshot(sigmx_get("/optional?sigmx=%7B%22q%22%3A%22a%22%7D"))
        .await
        .unwrap();
    assert_eq!(text(res).await, "true a");
    let res = app()
        .oneshot(Request::get("/optional?q=a").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(
        text(res).await,
        "false -",
        "a browser navigation carries no signals"
    );
}

#[tokio::test]
async fn plain_responses_carry_the_headers() {
    let res = app().oneshot(sigmx_get("/page")).await.unwrap();
    assert_eq!(
        res.headers()[header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    assert_eq!(res.headers()["sigmx-selector"], "#t");
    assert_eq!(res.headers()["sigmx-mode"], "inner");
    let res = app().oneshot(sigmx_get("/count")).await.unwrap();
    assert_eq!(res.headers()[header::CONTENT_TYPE], "application/json");
    assert_eq!(res.headers()["sigmx-only-if-missing"], "true");
    assert_eq!(text(res).await, r#"{"count":3}"#);
    let res = app().oneshot(sigmx_get("/one")).await.unwrap();
    assert_eq!(res.headers()[header::CONTENT_TYPE], "text/event-stream");
    assert_eq!(
        text(res).await,
        "event: sigmx-patch-elements\ndata: elements <p id=\"p\">one</p>\n\n"
    );
}

#[tokio::test]
async fn streams_run_until_the_future_completes() {
    let res = app().oneshot(sigmx_get("/progress")).await.unwrap();
    assert_eq!(res.headers()[header::CONTENT_TYPE], "text/event-stream");
    let body = text(res).await;
    assert_eq!(body.matches("event: sigmx-patch-signals").count(), 3);
    assert!(body.ends_with("data: signals {\"progress\":3}\n\n"));
}

#[tokio::test]
async fn channels_end_when_the_writer_drops() {
    let body = text(app().oneshot(sigmx_get("/channel")).await.unwrap()).await;
    assert_eq!(body.matches("event: sigmx-patch-elements").count(), 2);
    assert!(body.contains("data: mode remove"));
}

#[tokio::test]
async fn form_bodies() {
    let req = Request::post("/form")
        .header("sigmx-request", "true")
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(Body::from("q=hello+there"))
        .unwrap();
    assert_eq!(text(app().oneshot(req).await.unwrap()).await, "hello there");
    let req = Request::post("/form")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"q":"j"}"#))
        .unwrap();
    assert_eq!(text(app().oneshot(req).await.unwrap()).await, "j");
}

#[tokio::test]
async fn the_client_is_served_with_an_etag() {
    let res = app()
        .oneshot(Request::get("/sigmx.js").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers()[header::CONTENT_TYPE],
        "text/javascript; charset=utf-8"
    );
    let etag = res.headers()[header::ETAG].to_str().unwrap().to_owned();
    assert_eq!(etag, sigmx::client::ETAG);
    assert_eq!(text(res).await, sigmx::client::STANDALONE);
    let res = app()
        .oneshot(
            Request::get("/sigmx.js")
                .header(header::IF_NONE_MATCH, &etag)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_MODIFIED);
}

//! The Worker entry point: axum routes served through workers-rs. Everything sigmx-specific is a
//! handler returning one of the SDK's responses.

use axum::{
    routing::{get, post},
    Router,
};
use maud::{html, Markup, DOCTYPE};
use serde::Deserialize;
use sigmx::axum::{ReadSignals, Sse};
use sigmx::prelude::*;
use std::time::Duration;
use tower_service::Service;
use worker::{event, Context, Env, HttpRequest};

const TOWNS: &[&str] = &[
    "Banbury",
    "Bicester",
    "Brackley",
    "Chipping Norton",
    "Deddington",
    "Hook Norton",
    "Kineton",
    "Middleton Cheney",
    "Shipston-on-Stour",
    "Southam",
];

#[event(fetch)]
async fn fetch(
    req: HttpRequest,
    _env: Env,
    _ctx: Context,
) -> worker::Result<axum::response::Response> {
    console_error_panic_hook::set_once();
    Ok(router().call(req).await?)
}

fn router() -> Router {
    Router::new()
        .route("/", get(index))
        .route("/search", get(search))
        .route("/greet", post(greet))
        .route("/progress", get(progress))
}

async fn index() -> HtmlResponse {
    html(page())
}

#[derive(Deserialize, Default)]
struct Search {
    #[serde(default)]
    q: String,
}

/// Two patches in one response: the list, then the signal the input's busy state watches.
async fn search(ReadSignals(s): ReadSignals<Search>) -> Sse {
    let q = s.q.trim().to_lowercase();
    let hits = TOWNS
        .iter()
        .filter(|t| q.is_empty() || t.to_lowercase().contains(&q));
    Sse::events([
        PatchElements::new(html! { ul id="towns" { @for t in hits { li { (t) } } } }).into_event(),
        PatchSignals::new(r#"{"searching":false}"#).into_event(),
    ])
}

#[derive(Deserialize)]
struct Greet {
    name: String,
}

/// A `contentType: 'form'` post: the form's fields arrive as signals, the reply is plain HTML
/// morphed over `#greeting`.
async fn greet(ReadSignals(g): ReadSignals<Greet>) -> HtmlResponse {
    html(html! { p id="greeting" { "Hello, " (g.name.trim()) "." } })
}

/// A stream that runs while the client reads it. Workers futures are not `Send`; `SendFuture`
/// wraps this one so axum's body can carry it (the Worker runtime is single-threaded).
async fn progress() -> Sse {
    Sse::run(|s| {
        worker::send::SendFuture::new(async move {
            for step in 1..=10 {
                worker::Delay::from(Duration::from_millis(150)).await;
                if !s.patch_signals(format!(r#"{{"progress":{}}}"#, step * 10)) {
                    return;
                }
            }
            s.patch_elements(html! { p id="progress-note" { "Done." } });
        })
    })
}

fn page() -> Markup {
    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                title { "sigmx on Workers" }
                style { "body{font:16px/1.5 system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem}[data-cloak]{display:none!important}input,button{font:inherit;padding:.4rem .6rem}progress{width:100%}" }
                script type="module" src="/sigmx.js" {}
            }
            body data-signals="{ count: 0, q: '', name: '', searching: false, progress: 0 }" {
                h1 { "sigmx on Cloudflare Workers" }

                section {
                    h2 { "Signals" }
                    button data-on:click="$count++" { "Clicked " b data-text="$count" { "0" } " times" }
                    p data-show="$count > 4" data-cloak { "That is plenty." }
                }

                section {
                    h2 { "Search (GET, two patches in one response)" }
                    input type="search" placeholder="Town" data-bind:q
                        data-on:input="$searching = true"
                        "data-on:input__debounce.200ms"="@get('/search')"
                        data-attr:aria-busy="$searching ? 'true' : 'false'";
                    ul id="towns" { @for t in TOWNS { li { (t) } } }
                }

                section {
                    h2 { "Form (POST, plain HTML back)" }
                    form data-on:submit__prevent="@post('/greet', { contentType: 'form' })" {
                        input name="name" placeholder="Your name" data-bind:name required;
                        button type="submit" { "Greet" }
                    }
                    p id="greeting" { "Type a name; " span data-shout="$name" {} }
                }

                section {
                    h2 { "Stream" }
                    button data-on:click="@get('/progress')" data-indicator:running data-attr:disabled="$running" { "Run" }
                    progress max="100" data-attr:value="$progress" {}
                    p id="progress-note" {}
                }
            }
        }
    }
}

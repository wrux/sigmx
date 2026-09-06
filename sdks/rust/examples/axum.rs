//! A native axum server: `cargo run --example axum --features axum,client`, then open
//! http://localhost:3000. The same handlers run unchanged inside a Cloudflare Worker; see
//! examples/worker.

use axum::routing::{get, post};
use axum::Router;
use maud::{html, Markup, DOCTYPE};
use serde::Deserialize;
use sigmx::axum::{serve_client, ReadSignals, Sse};
use sigmx::prelude::*;
use std::time::Duration;

const TOWNS: &[&str] = &[
    "Banbury",
    "Bicester",
    "Brackley",
    "Chipping Norton",
    "Deddington",
    "Hook Norton",
];

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(index))
        .route("/sigmx.js", get(serve_client))
        .route("/search", get(search))
        .route("/greet", post(greet))
        .route("/progress", get(progress));
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
        .await
        .unwrap();
    println!("http://localhost:{port}");
    axum::serve(listener, app).await.unwrap();
}

async fn index() -> HtmlResponse {
    html(page())
}

#[derive(Deserialize, Default)]
struct Search {
    #[serde(default)]
    q: String,
}

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

async fn greet(ReadSignals(g): ReadSignals<Greet>) -> HtmlResponse {
    html(html! { p id="greeting" { "Hello, " (g.name.trim()) "." } })
}

async fn progress() -> Sse {
    Sse::run(|s| async move {
        for step in 1..=10 {
            tokio::time::sleep(Duration::from_millis(150)).await;
            if !s.patch_signals(format!(r#"{{"progress":{}}}"#, step * 10)) {
                return; // the client went away
            }
        }
        s.patch_elements(html! { p id="progress-note" { "Done." } });
    })
}

fn page() -> Markup {
    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                title { "sigmx + axum" }
                style { "body{font:16px/1.5 system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem}[data-cloak]{display:none!important}input,button{font:inherit;padding:.4rem .6rem}progress{width:100%}" }
                script type="module" src="/sigmx.js" {}
            }
            body data-signals="{ count: 0, q: '', name: '', searching: false, progress: 0 }" {
                h1 { "sigmx + axum" }
                section {
                    button data-on:click="$count++" { "Clicked " b data-text="$count" { "0" } " times" }
                    p data-show="$count > 4" data-cloak { "That is plenty." }
                }
                section {
                    h2 { "Search" }
                    input type="search" placeholder="Town" data-bind:q
                        data-on:input="$searching = true"
                        "data-on:input__debounce.200ms"="@get('/search')"
                        data-attr:aria-busy="$searching ? 'true' : 'false'";
                    ul id="towns" { @for t in TOWNS { li { (t) } } }
                }
                section {
                    h2 { "Form" }
                    form data-on:submit__prevent="@post('/greet', { contentType: 'form' })" {
                        input name="name" placeholder="Your name" data-bind:name required;
                        button type="submit" { "Greet" }
                    }
                    p id="greeting" {}
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

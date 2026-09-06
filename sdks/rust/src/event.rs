//! Server events and the builders for the two the client ships handlers for.

use std::collections::BTreeMap;
use std::fmt::{self, Write as _};
use std::time::Duration;

/// The prefix sigmx puts on its own event names.
pub const EVENT_PREFIX: &str = "sigmx-";
/// Event name for a `patch-elements` event.
pub const EVENT_PATCH_ELEMENTS: &str = "sigmx-patch-elements";
/// Event name for a `patch-signals` event.
pub const EVENT_PATCH_SIGNALS: &str = "sigmx-patch-signals";

/// How `patch-elements` puts markup into the page.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
pub enum PatchMode {
    /// Morph the target (the default). Without a selector, top-level elements are matched by id.
    #[default]
    Outer,
    /// Morph the target's children.
    Inner,
    /// Replace the target outright, without morphing.
    Replace,
    /// Insert as the target's first children.
    Prepend,
    /// Insert as the target's last children.
    Append,
    /// Insert before the target.
    Before,
    /// Insert after the target.
    After,
    /// Remove the target; needs a selector.
    Remove,
}

impl PatchMode {
    /// The value on the wire.
    pub const fn as_str(self) -> &'static str {
        match self {
            PatchMode::Outer => "outer",
            PatchMode::Inner => "inner",
            PatchMode::Replace => "replace",
            PatchMode::Prepend => "prepend",
            PatchMode::Append => "append",
            PatchMode::Before => "before",
            PatchMode::After => "after",
            PatchMode::Remove => "remove",
        }
    }
}

impl fmt::Display for PatchMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The name the Datastar SDK uses for [`PatchMode`].
pub type ElementPatchMode = PatchMode;

/// One event on the wire: a name, `key value` data lines, and the optional SSE `id` and `retry`.
///
/// `Display` renders the event-stream format. A value that spans several lines becomes several
/// `data: key …` lines, which the client joins again, so no value can inject an extra field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Event {
    /// Full event name, e.g. `sigmx-patch-elements`.
    pub event: String,
    /// Data lines, each `key value`.
    pub lines: Vec<String>,
    /// SSE event id; the client sends the last one back as `Last-Event-ID` when it reconnects.
    pub id: Option<String>,
    /// SSE reconnect delay.
    pub retry: Option<Duration>,
}

impl Event {
    /// An event with this exact name and no data yet.
    pub fn new(event: impl Into<String>) -> Self {
        Event {
            event: event.into(),
            lines: Vec::new(),
            id: None,
            retry: None,
        }
    }

    /// An event named `sigmx-<name>`, for handlers you register yourself (`handler({ name })`).
    pub fn custom(name: &str) -> Self {
        Event::new(format!("{EVENT_PREFIX}{name}"))
    }

    /// Add a `key value` data line.
    pub fn line(mut self, key: &str, value: impl AsRef<str>) -> Self {
        self.lines.push(format!("{key} {}", value.as_ref()));
        self
    }

    /// Set the SSE event id.
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Set the SSE reconnect delay.
    pub fn retry(mut self, retry: Duration) -> Self {
        self.retry = Some(retry);
        self
    }

    /// Append the wire format to `out`.
    pub fn write_to(&self, out: &mut String) {
        if let Some(id) = &self.id {
            out.push_str("id: ");
            push_one_line(out, id);
            out.push('\n');
        }
        if let Some(retry) = self.retry {
            let _ = writeln!(out, "retry: {}", retry.as_millis());
        }
        out.push_str("event: ");
        push_one_line(out, &self.event);
        out.push('\n');
        for line in &self.lines {
            match line.find(' ') {
                None => {
                    out.push_str("data: ");
                    out.push_str(line);
                    out.push('\n');
                }
                Some(i) => {
                    let (key, value) = (&line[..i], &line[i + 1..]);
                    for part in value.split('\n') {
                        let part = part.strip_suffix('\r').unwrap_or(part);
                        out.push_str("data: ");
                        out.push_str(key);
                        out.push(' ');
                        out.push_str(part);
                        out.push('\n');
                    }
                }
            }
        }
        out.push('\n');
    }

    /// The wire format.
    pub fn to_sse(&self) -> String {
        let mut out = String::new();
        self.write_to(&mut out);
        out
    }
}

impl fmt::Display for Event {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_sse())
    }
}

/// Runs of line breaks become one space: `id` and `event` are single-line fields.
fn push_one_line(out: &mut String, s: &str) {
    let mut in_break = false;
    for c in s.chars() {
        if c == '\n' || c == '\r' {
            if !in_break {
                out.push(' ');
            }
            in_break = true;
        } else {
            in_break = false;
            out.push(c);
        }
    }
}

/// Several events, formatted back to back: the body of a fixed event-stream response.
pub fn format_events<I>(events: I) -> String
where
    I: IntoIterator,
    I::Item: Into<Event>,
{
    let mut out = String::new();
    for e in events {
        e.into().write_to(&mut out);
    }
    out
}

/// A `patch-elements` event: HTML the client morphs into the page.
///
/// Without a selector, each top-level element is morphed over the element with the same `id`.
/// With one, `mode` says how the markup lands relative to the matched element(s).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchElements {
    /// The markup; `None` for a remove.
    pub elements: Option<String>,
    /// CSS selector of the target(s).
    pub selector: Option<String>,
    /// How the markup is applied.
    pub mode: PatchMode,
    /// SSE event id.
    pub id: Option<String>,
    /// SSE reconnect delay.
    pub retry: Option<Duration>,
}

impl PatchElements {
    /// Patch this markup (a `String`, `&str`, or anything that converts into one, such as
    /// `maud::Markup`). Leading and trailing whitespace is dropped.
    pub fn new(html: impl Into<String>) -> Self {
        PatchElements {
            elements: Some(html.into().trim().to_owned()),
            selector: None,
            mode: PatchMode::Outer,
            id: None,
            retry: None,
        }
    }

    /// Remove every element matching `selector`.
    pub fn remove(selector: impl Into<String>) -> Self {
        PatchElements {
            elements: None,
            selector: Some(selector.into()),
            mode: PatchMode::Remove,
            id: None,
            retry: None,
        }
    }

    /// The name the Datastar SDK uses for [`PatchElements::remove`].
    pub fn new_remove(selector: impl Into<String>) -> Self {
        Self::remove(selector)
    }

    /// Target the elements matching this CSS selector instead of matching by id.
    pub fn selector(mut self, selector: impl Into<String>) -> Self {
        self.selector = Some(selector.into());
        self
    }

    /// Set the patch mode.
    pub fn mode(mut self, mode: PatchMode) -> Self {
        self.mode = mode;
        self
    }

    /// Set the SSE event id.
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Set the SSE reconnect delay.
    pub fn retry(mut self, retry: Duration) -> Self {
        self.retry = Some(retry);
        self
    }

    /// The event.
    pub fn to_event(&self) -> Event {
        let mut e = Event::new(EVENT_PATCH_ELEMENTS);
        if let Some(s) = &self.selector {
            e = e.line("selector", s);
        }
        if self.mode != PatchMode::Outer {
            e = e.line("mode", self.mode.as_str());
        }
        if let Some(html) = &self.elements {
            e = e.line("elements", html);
        }
        e.id = self.id.clone();
        e.retry = self.retry;
        e
    }

    /// The event.
    pub fn into_event(self) -> Event {
        self.to_event()
    }
}

impl From<PatchElements> for Event {
    fn from(p: PatchElements) -> Event {
        p.into_event()
    }
}
impl From<&PatchElements> for Event {
    fn from(p: &PatchElements) -> Event {
        p.to_event()
    }
}

/// A `patch-signals` event: JSON merged into the client's signals (merge-patch: objects merge,
/// `null` removes).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchSignals {
    /// The patch as JSON text.
    pub signals: String,
    /// Keep values the client already has.
    pub only_if_missing: bool,
    /// SSE event id.
    pub id: Option<String>,
    /// SSE reconnect delay.
    pub retry: Option<Duration>,
}

impl PatchSignals {
    /// Patch with this JSON text.
    pub fn new(json: impl Into<String>) -> Self {
        PatchSignals {
            signals: json.into(),
            only_if_missing: false,
            id: None,
            retry: None,
        }
    }

    /// Patch with a `serde_json::Value`, typically from the `json!` macro.
    #[cfg(feature = "json")]
    pub fn from_value(value: serde_json::Value) -> Self {
        Self::new(value.to_string())
    }

    /// Remove these dotted paths (`user.name`, `draft`) by patching them to `null`.
    pub fn remove<I, S>(paths: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        #[derive(Default)]
        struct Node(BTreeMap<String, Option<Node>>);
        fn write(out: &mut String, node: &Node) {
            out.push('{');
            for (i, (k, v)) in node.0.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                crate::jsonfmt::push_json_str(out, k);
                out.push(':');
                match v {
                    None => out.push_str("null"),
                    Some(n) => write(out, n),
                }
            }
            out.push('}');
        }
        let mut root = Node::default();
        for path in paths {
            let mut keys = path.as_ref().split('.').peekable();
            let mut cur = &mut root;
            while let Some(k) = keys.next() {
                if keys.peek().is_none() {
                    cur.0.insert(k.to_owned(), None);
                } else {
                    cur = cur
                        .0
                        .entry(k.to_owned())
                        .or_insert_with(|| Some(Node::default()))
                        .get_or_insert_with(Node::default);
                }
            }
        }
        let mut out = String::new();
        write(&mut out, &root);
        Self::new(out)
    }

    /// Keep values the client already has; only add missing ones.
    pub fn only_if_missing(mut self, only_if_missing: bool) -> Self {
        self.only_if_missing = only_if_missing;
        self
    }

    /// Set the SSE event id.
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Set the SSE reconnect delay.
    pub fn retry(mut self, retry: Duration) -> Self {
        self.retry = Some(retry);
        self
    }

    /// The event.
    pub fn to_event(&self) -> Event {
        let mut e = Event::new(EVENT_PATCH_SIGNALS);
        if self.only_if_missing {
            e = e.line("onlyIfMissing", "true");
        }
        e = e.line("signals", &self.signals);
        e.id = self.id.clone();
        e.retry = self.retry;
        e
    }

    /// The event.
    pub fn into_event(self) -> Event {
        self.to_event()
    }
}

impl From<PatchSignals> for Event {
    fn from(p: PatchSignals) -> Event {
        p.into_event()
    }
}
impl From<&PatchSignals> for Event {
    fn from(p: &PatchSignals) -> Event {
        p.to_event()
    }
}
#[cfg(feature = "json")]
impl From<serde_json::Value> for PatchSignals {
    fn from(v: serde_json::Value) -> Self {
        Self::from_value(v)
    }
}
#[cfg(feature = "json")]
impl From<serde_json::Value> for Event {
    fn from(v: serde_json::Value) -> Event {
        PatchSignals::from_value(v).into_event()
    }
}

/// Run a script in the browser: a `<script>` element appended to `<body>` through `patch-elements`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecuteScript {
    /// The JavaScript.
    pub script: String,
    /// Remove the element after it runs (default true).
    pub auto_remove: bool,
    /// Extra attributes on the `<script>` element, e.g. `("type", "module")`.
    pub attributes: Vec<(String, String)>,
    /// SSE event id.
    pub id: Option<String>,
    /// SSE reconnect delay.
    pub retry: Option<Duration>,
}

impl ExecuteScript {
    /// Run this script.
    pub fn new(script: impl Into<String>) -> Self {
        ExecuteScript {
            script: script.into(),
            auto_remove: true,
            attributes: Vec::new(),
            id: None,
            retry: None,
        }
    }

    /// Whether the element is removed after it runs.
    pub fn auto_remove(mut self, auto_remove: bool) -> Self {
        self.auto_remove = auto_remove;
        self
    }

    /// Add an attribute to the `<script>` element.
    pub fn attribute(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.attributes.push((name.into(), value.into()));
        self
    }

    /// Add several attributes.
    pub fn attributes<I, K, V>(mut self, attributes: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        self.attributes
            .extend(attributes.into_iter().map(|(k, v)| (k.into(), v.into())));
        self
    }

    /// Set the SSE event id.
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Set the SSE reconnect delay.
    pub fn retry(mut self, retry: Duration) -> Self {
        self.retry = Some(retry);
        self
    }

    /// The underlying `patch-elements`.
    pub fn to_patch(&self) -> PatchElements {
        let mut tag = String::from("<script");
        if self.auto_remove {
            tag.push_str(" data-init=\"el.remove()\"");
        }
        for (k, v) in &self.attributes {
            let _ = write!(tag, " {k}=\"{}\"", v.replace('"', "&quot;"));
        }
        let _ = write!(tag, ">{}</script>", self.script);
        let mut p = PatchElements::new(tag)
            .selector("body")
            .mode(PatchMode::Append);
        p.id = self.id.clone();
        p.retry = self.retry;
        p
    }

    /// The event.
    pub fn to_event(&self) -> Event {
        self.to_patch().into_event()
    }

    /// The event.
    pub fn into_event(self) -> Event {
        self.to_event()
    }
}

impl From<ExecuteScript> for Event {
    fn from(s: ExecuteScript) -> Event {
        s.into_event()
    }
}
impl From<&ExecuteScript> for Event {
    fn from(s: &ExecuteScript) -> Event {
        s.to_event()
    }
}

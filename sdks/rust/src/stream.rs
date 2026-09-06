//! Streams of events with no runtime attached: a channel a handler writes to, or a future that
//! drives the stream while it runs. `axum::Sse` and `worker::stream` build on these.

use crate::{Event, ExecuteScript, PatchElements, PatchSignals};
use futures_channel::mpsc::{unbounded, UnboundedReceiver, UnboundedSender};
use futures_core::Stream;
use std::future::Future;
use std::marker::PhantomData;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};

/// The writing end of an event stream. Cloneable; the stream ends when every writer is dropped.
#[derive(Debug, Clone)]
pub struct SseWriter {
    tx: UnboundedSender<Event>,
}

impl SseWriter {
    /// Send an event. Returns false once the reader is gone (the client disconnected).
    pub fn send(&self, event: impl Into<Event>) -> bool {
        self.tx.unbounded_send(event.into()).is_ok()
    }
    /// Send a `patch-elements` event morphing this markup by id.
    pub fn patch_elements(&self, html: impl Into<String>) -> bool {
        self.send(PatchElements::new(html))
    }
    /// Send a `patch-elements` event removing the elements matching `selector`.
    pub fn remove_elements(&self, selector: impl Into<String>) -> bool {
        self.send(PatchElements::remove(selector))
    }
    /// Send a `patch-signals` event with this JSON text.
    pub fn patch_signals(&self, json: impl Into<String>) -> bool {
        self.send(PatchSignals::new(json))
    }
    /// Send a `patch-signals` event removing these dotted paths.
    pub fn remove_signals<I, S>(&self, paths: I) -> bool
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        self.send(PatchSignals::remove(paths))
    }
    /// Send a script to run in the browser.
    pub fn execute_script(&self, script: impl Into<String>) -> bool {
        self.send(ExecuteScript::new(script))
    }
    /// True once the reader is gone.
    pub fn is_closed(&self) -> bool {
        self.tx.is_closed()
    }
    /// End the stream (for this writer; clones keep it open).
    pub fn close(self) {}
}

/// Wakes whichever waker the stream was last polled with. Body streams on Cloudflare Workers are
/// pulled with a fresh waker per chunk, and some futures (`worker::Delay`) only remember the waker
/// of their first poll; forwarding through this one keeps every wake reaching the current pull.
#[derive(Debug, Default)]
struct Forward(Mutex<Option<Waker>>);

impl Wake for Forward {
    fn wake(self: Arc<Self>) {
        self.wake_by_ref();
    }
    fn wake_by_ref(self: &Arc<Self>) {
        let latest = self.0.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Some(w) = latest {
            w.wake();
        }
    }
}

/// A stream of events fed by [`SseWriter`]s, optionally driving a future alongside: the future is
/// polled whenever the stream is, so a handler needs no spawner and no runtime.
#[derive(Debug)]
pub struct Driven<F> {
    fut: Option<Pin<Box<F>>>,
    rx: UnboundedReceiver<Event>,
    forward: Arc<Forward>,
    waker: Waker,
}

impl<F> Driven<F> {
    fn new(fut: Option<Pin<Box<F>>>, rx: UnboundedReceiver<Event>) -> Self {
        let forward = Arc::new(Forward::default());
        let waker = Waker::from(forward.clone());
        Driven {
            fut,
            rx,
            forward,
            waker,
        }
    }
}

/// An event stream with no future behind it: whoever holds the writer feeds it.
pub type Channel = Driven<std::future::Pending<()>>;

/// A stream and a writer for it.
pub fn channel() -> (SseWriter, Channel) {
    let (tx, rx) = unbounded();
    (SseWriter { tx }, Driven::new(None, rx))
}

/// A stream that runs `f`'s future while it is read. The writer passed to `f` is dropped with the
/// future unless it was cloned out, so the stream ends when the future does.
pub fn drive<F, Fut>(f: F) -> Driven<Fut>
where
    F: FnOnce(SseWriter) -> Fut,
    Fut: Future<Output = ()>,
{
    let (tx, rx) = unbounded();
    let fut = f(SseWriter { tx });
    Driven::new(Some(Box::pin(fut)), rx)
}

impl<F: Future<Output = ()>> Stream for Driven<F> {
    type Item = Event;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Event>> {
        let this = self.get_mut();
        *this.forward.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(cx.waker().clone());
        let mut fcx = Context::from_waker(&this.waker);
        if let Some(fut) = this.fut.as_mut() {
            if fut.as_mut().poll(&mut fcx).is_ready() {
                this.fut = None;
            }
        }
        Pin::new(&mut this.rx).poll_next(&mut fcx)
    }
}

/// Events as formatted byte chunks with an error type of the caller's choosing (never produced),
/// which is what body types built on `TryStream` want.
#[derive(Debug)]
pub struct Chunks<S, E> {
    inner: S,
    _error: PhantomData<fn() -> E>,
}

/// Format each event of `stream` as a byte chunk.
pub fn chunks<S, E>(stream: S) -> Chunks<S, E>
where
    S: Stream<Item = Event> + Unpin,
{
    Chunks {
        inner: stream,
        _error: PhantomData,
    }
}

impl<S, E> Stream for Chunks<S, E>
where
    S: Stream<Item = Event> + Unpin,
{
    type Item = Result<Vec<u8>, E>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.get_mut().inner)
            .poll_next(cx)
            .map(|e| e.map(|e| Ok(e.to_sse().into_bytes())))
    }
}

/// Any event stream, boxed so it is `Unpin`.
pub type BoxStream = Pin<Box<dyn Stream<Item = Event> + Send + 'static>>;
/// Any event stream, boxed, without `Send` (Cloudflare Workers).
pub type LocalBoxStream = Pin<Box<dyn Stream<Item = Event> + 'static>>;

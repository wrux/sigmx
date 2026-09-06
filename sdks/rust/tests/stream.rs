//! The runtime-free stream, polled the way a Workers response body polls it: a fresh waker for
//! every chunk, and a future that only remembers the waker of its first poll.

use futures_core::Stream;
use sigmx::stream::drive;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};
use std::time::{Duration, Instant};

/// Like `worker::Delay`: the waker is captured once, on the first poll, and woken from elsewhere.
struct OneShotSleep {
    started: bool,
    done: Arc<AtomicBool>,
}

impl OneShotSleep {
    fn new() -> Self {
        OneShotSleep {
            started: false,
            done: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl Future for OneShotSleep {
    type Output = ();
    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        if !self.started {
            self.started = true;
            let waker = cx.waker().clone();
            let done = self.done.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(5));
                done.store(true, Ordering::SeqCst);
                waker.wake();
            });
            return Poll::Pending;
        }
        if self.done.load(Ordering::SeqCst) {
            Poll::Ready(())
        } else {
            Poll::Pending
        }
    }
}

struct Flag(AtomicBool);
impl Wake for Flag {
    fn wake(self: Arc<Self>) {
        self.0.store(true, Ordering::SeqCst);
    }
}

#[test]
fn one_shot_wakers_reach_every_pull() {
    let mut stream = drive(|w| async move {
        for i in 0..3 {
            OneShotSleep::new().await;
            w.patch_signals(format!(r#"{{"i":{i}}}"#));
        }
    });
    let mut events = Vec::new();
    loop {
        // Each pull gets its own waker, as a JS ReadableStream's pull does.
        let flag = Arc::new(Flag(AtomicBool::new(false)));
        let waker = Waker::from(flag.clone());
        match Pin::new(&mut stream).poll_next(&mut Context::from_waker(&waker)) {
            Poll::Ready(Some(e)) => events.push(e.lines[0].clone()),
            Poll::Ready(None) => break,
            Poll::Pending => {
                let start = Instant::now();
                while !flag.0.load(Ordering::SeqCst) {
                    assert!(
                        start.elapsed() < Duration::from_secs(2),
                        "a wake never reached this pull"
                    );
                    std::thread::sleep(Duration::from_millis(1));
                }
            }
        }
    }
    assert_eq!(
        events,
        vec![
            r#"signals {"i":0}"#,
            r#"signals {"i":1}"#,
            r#"signals {"i":2}"#
        ]
    );
}

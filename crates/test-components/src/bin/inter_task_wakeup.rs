mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "inter-task-wakeup",
    });
    export!(Component);
}

use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;
use std::task::{Context, Poll, Waker};

use bindings::wakeup_tick;

struct Component;

/// Shared slot between the detached pump task and the parked `await-wake` task.
///
/// The value is only ever set by the pump; the waker is only ever set by the
/// parked future. Waking crosses component-model task boundaries with a
/// purely Rust-originating event (exercising wit-bindgen's inter-task-wakeup
/// unit stream).
static SLOT: Mutex<(Option<u32>, Option<Waker>)> = Mutex::new((None, None));

struct AwaitWake;

impl Future for AwaitWake {
    type Output = u32;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<u32> {
        let mut slot = SLOT.lock().unwrap();
        if let Some(v) = slot.0 {
            Poll::Ready(v)
        } else {
            slot.1 = Some(cx.waker().clone());
            Poll::Pending
        }
    }
}

impl bindings::Guest for Component {
    async fn start_pump() {
        wit_bindgen::spawn_local(async move {
            let v = wakeup_tick().await;
            let waker = {
                let mut slot = SLOT.lock().unwrap();
                slot.0 = Some(v);
                slot.1.take()
            };
            if let Some(waker) = waker {
                waker.wake();
            }
        });
    }

    async fn await_wake() -> u32 {
        AwaitWake.await
    }
}

// Stub only to ensure this works as a binary
fn main() {}

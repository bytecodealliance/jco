//! Guest->guest regression test caller for `subtask.cancel` of a running
//! (STARTED) subtask.
//!
//! Starts the callee's `blocked-call`, waits (via the host) until the callee
//! is actually blocked on its pending host import, then drops the in-flight
//! future. The drop lowers to the `subtask.cancel` canonical built-in; the
//! cancellation request must be delivered to the callee task, which
//! acknowledges it via the `task.cancel` canonical built-in (wit-bindgen's
//! `TaskCancelOnDrop`), resolving the subtask as CANCELLED_BEFORE_RETURNED.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "subtask-cancel-g2g-caller",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_async;
use bindings::jco::test_components::subtask_cancel_drop_host;
use bindings::jco::test_components::subtask_cancel_g2g;

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {
        {
            let mut fut = Box::pin(subtask_cancel_g2g::blocked_call());

            // Poll once so the call to the callee is issued
            let polled = futures::poll!(fut.as_mut());
            assert!(polled.is_pending(), "blocked-call resolved unexpectedly");

            // Wait until the callee has actually started and is blocked on its
            // (never-resolving) host import
            subtask_cancel_drop_host::wait_until_blocked().await;

            let polled = futures::poll!(fut.as_mut());
            assert!(polled.is_pending(), "blocked-call resolved unexpectedly");

            // `fut` is dropped here while the callee is running -> `subtask.cancel`,
            // which blocks (sync lower) until the callee acknowledges cancellation
            // via `task.cancel`
        }

        // Getting here means the cancellation round-trip completed
        subtask_cancel_drop_host::completed();
    }
}

fn main() {}

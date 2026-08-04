//! Guest->guest regression test caller for `subtask.cancel` of a still-STARTING
//! subtask.
//!
//! jco defers the actual start of a guest->guest callee, so a call dropped
//! immediately after being issued is cancelled while still in the STARTING
//! state: the callee must never run, and the subtask resolves as
//! CANCELLED_BEFORE_STARTED.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "subtask-cancel-g2g-starting-caller",
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

            // Poll once so the call to the callee is issued (still STARTING)
            let polled = futures::poll!(fut.as_mut());
            assert!(polled.is_pending(), "blocked-call resolved unexpectedly");

            // `fut` is dropped here before the callee starts -> `subtask.cancel`
            // resolves the subtask as CANCELLED_BEFORE_STARTED
        }

        subtask_cancel_drop_host::completed();
    }
}

fn main() {}

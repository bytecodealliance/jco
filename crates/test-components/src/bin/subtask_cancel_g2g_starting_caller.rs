//! Cancel a guest call while explicit backpressure keeps it STARTING.
//! This does not depend on when the runtime schedules an unblocked callee.
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
        subtask_cancel_g2g::hold_entry();
        {
            let mut fut = Box::pin(subtask_cancel_g2g::blocked_call());

            // Poll once: backpressure prevents the callee from entering.
            let polled = futures::poll!(fut.as_mut());
            assert!(polled.is_pending(), "blocked-call resolved unexpectedly");

            // Dropping `fut` before the callee can enter -> `subtask.cancel`
            // resolves the subtask as CANCELLED_BEFORE_STARTED
        }

        subtask_cancel_drop_host::completed();
    }
}

fn main() {}

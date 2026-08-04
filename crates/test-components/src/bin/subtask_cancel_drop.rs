//! Regression test guest for `subtask.cancel`.
//!
//! Dropping an in-flight async import future lowers to the `subtask.cancel`
//! canonical built-in (wit-bindgen's `WaitableOperation` drop path), which the
//! jco runtime previously mis-implemented as a copy of `task.cancel`, trapping
//! with "task cancellation has not been requested".
//!
//! The host never resolves `pending-call`, so the future is guaranteed to be
//! in the STARTED state when dropped.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "subtask-cancel-drop",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_async;
use bindings::jco::test_components::subtask_cancel_drop_host;

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {
        {
            let mut fut = Box::pin(subtask_cancel_drop_host::pending_call());

            // Poll once so the import call actually starts (the subtask is
            // in-flight); the host never resolves it.
            let polled = futures::poll!(fut.as_mut());
            assert!(polled.is_pending(), "pending-call resolved unexpectedly");

            // `fut` is dropped here while in-flight -> `subtask.cancel`
        }

        // Getting here means the drop (cancel) path completed without trapping
        subtask_cancel_drop_host::completed();
    }
}

fn main() {}

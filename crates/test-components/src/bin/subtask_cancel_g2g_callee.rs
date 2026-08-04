//! Guest->guest regression test callee for `subtask.cancel`.
//!
//! `blocked-call` awaits a host import that never resolves, so this task can
//! only complete by being cancelled: the caller's `subtask.cancel` delivers a
//! TASK_CANCELLED event, wit-bindgen drops the future state (cancelling the
//! nested pending host import along the way), and acknowledges via the
//! `task.cancel` canonical built-in.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "subtask-cancel-g2g-callee",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::subtask_cancel_g2g;
use bindings::jco::test_components::subtask_cancel_drop_host;

struct Component;

impl subtask_cancel_g2g::Guest for Component {
    async fn blocked_call() -> u32 {
        // The host never resolves this; we stay blocked until cancelled
        subtask_cancel_drop_host::pending_call().await
    }
}

fn main() {}

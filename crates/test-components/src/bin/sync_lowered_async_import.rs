//! Reproducer for bug 2 in https://github.com/bytecodealliance/jco/issues/1898.
//!
//! The imported function is async in WIT but deliberately sync-lowered by
//! this Rust guest. The broken trampoline neither invoked the host function
//! nor waited on the correct subtask, so the call failed or deadlocked.

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "sync-lowered-async-import",
        async: [
            "-import:jco:test-components/sync-lowered-async-import-host#compute",
        ],
    });
    export!(Component);
}

use bindings::exports::jco::test_components::sync_lowered_async_import_runner::Guest;
use bindings::jco::test_components::sync_lowered_async_import_host as host;

struct Component;

impl Guest for Component {
    async fn run() -> u32 {
        // Despite the WIT `async`, this is a blocking Rust call because the
        // guest chose the synchronous canonical lowering at compile time.
        host::compute(41)
    }
}

fn main() {}

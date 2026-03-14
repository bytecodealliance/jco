//! This component used to be in the upstream set of scenario tests but was
//! removed in favor of tests that yield.

mod bindings {
    wit_bindgen::generate!({
        world: "sleep-post-return-caller",
    });

    use super::Component;
    export!(Component);
}

use bindings::exports::jco::test_components::sleep_post_return::Guest;
use bindings::jco::test_components::{sleep, sleep_post_return};
use wit_bindgen::rt::async_support;

struct Component;

impl Guest for Component {
    async fn run(sleep_time_millis: u64) {
        // Spawn a task to run post-return and otherwise return immediately.
        async_support::spawn(async move {
            // Create a couple of subtasks which will also return immediately
            // and sleep post-return.  These will not have completed once we
            // exit and thus will be reparented to the caller.
            sleep_post_return::run(sleep_time_millis * 2).await;
            sleep_post_return::run(sleep_time_millis * 2).await;
            // Sleep for as long as requested:
            sleep::sleep_millis(sleep_time_millis).await;
        });
    }
}

// Unused function; required since this file is built as a `bin`:
fn main() {}

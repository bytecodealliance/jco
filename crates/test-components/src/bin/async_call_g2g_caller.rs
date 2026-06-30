mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-call-g2g-caller",
    });
    export!(Component);
}

use crate::bindings::jco::test_components::local_run_async;

struct Component;

impl bindings::exports::jco::test_components::local_run_async::Guest for Component {
    async fn run() {
        local_run_async::run().await;
    }
}

// Stub only to ensure this works as a binary
fn main() {}

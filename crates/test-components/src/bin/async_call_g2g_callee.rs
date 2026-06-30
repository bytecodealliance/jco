mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-call-g2g-callee",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_async;

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {}
}

// Stub only to ensure this works as a binary
fn main() {}

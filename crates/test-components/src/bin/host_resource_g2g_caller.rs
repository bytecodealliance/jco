mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "host-resource-g2g-caller",
    });
    export!(Component);
}

use bindings::jco::test_components::host_resource_runner;

struct Component;

impl bindings::exports::jco::test_components::host_resource_runner::Guest for Component {
    async fn run(sync_count: u32) -> Vec<String> {
        host_resource_runner::run(sync_count).await
    }
}

// Stub only to ensure this works as a binary
fn main() {}

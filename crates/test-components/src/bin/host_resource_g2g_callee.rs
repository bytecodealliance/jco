mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "host-resource-g2g-callee",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::host_resource_runner::Guest;
use bindings::jco::test_components::host_resource_source::{Thing, make_async, make_sync};

struct Component;

impl Guest for Component {
    async fn run(sync_count: u32) -> Vec<String> {
        let mut things: Vec<Thing> = (0..sync_count)
            .map(|i| make_sync(&format!("sync-{i}")))
            .collect();
        things.push(make_async("async".into()).await);
        things.iter().map(Thing::name).collect()
    }
}

// Stub only to ensure this works as a binary
fn main() {}

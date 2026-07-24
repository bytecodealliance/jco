//! Regression component for the borrow-cleanup shape mismatch in
//! stream-carrying methods on host-implemented resources.

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-resource-method",
    });
    export!(Component);
}

use wit_bindgen::StreamReader;

use bindings::exports::jco::test_components::stream_resource_method_fns::{Chunk, Guest};
use bindings::jco::test_components::stream_resources::StreamSummer;

struct Component;

impl Guest for Component {
    async fn sum_via_resource(rx: StreamReader<Chunk>) -> u32 {
        let summer = StreamSummer::new();
        summer.sum_stream(rx).await
    }
}

fn main() {}

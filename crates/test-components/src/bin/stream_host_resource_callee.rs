mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "stream-host-resource-callee" });
    export!(Component);
}

use bindings::exports::jco::test_components::stream_host_resource_writer::Guest;
use bindings::jco::test_components::stream_host_resource_source::{Thing, make};
use bindings::wit_stream;
use wit_bindgen::StreamReader;

struct Component;

impl Guest for Component {
    async fn run() -> StreamReader<Thing> {
        let (mut tx, rx) = wit_stream::new();
        let thing = make();
        wit_bindgen::spawn_local(async move {
            assert!(tx.write_all(vec![thing]).await.is_empty());
        });
        rx
    }
}

fn main() {}

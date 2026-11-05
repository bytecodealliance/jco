//! Exercise instance lifecycle with a Rust reader component.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "instance-stop-reader" });
    export!(Component);
}

use wit_bindgen::StreamReader;

struct Component;

impl bindings::Guest for Component {
    async fn feed(mut value: StreamReader<u8>) {
        // The export returns before the background read completes.
        wit_bindgen::spawn_local(async move {
            value.next().await;
        });
    }

    fn pass(value: StreamReader<u8>) -> StreamReader<u8> {
        value
    }
}

fn main() {}

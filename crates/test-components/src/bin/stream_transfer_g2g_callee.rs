mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-transfer-g2g-callee",
    });
    export!(Component);
}

use wit_bindgen::StreamReader;
use wit_bindgen::rt::async_support::start_task;

use bindings::exports::jco::test_components::stream_transfer_source::Guest;
use bindings::wit_stream;

struct Component;

impl Guest for Component {
    // NOTE: this export is *sync-lifted*: when composed with a caller, the
    // returned stream end crosses the component boundary on the return path
    // of the fused call, *after* this component's task has been torn down
    // (see lann/jco#35).
    fn make_stream(seed: u8) -> StreamReader<u8> {
        let (mut tx, rx) = wit_stream::new();
        start_task(async move {
            let remaining = tx.write_all(vec![seed, seed + 1, seed + 2]).await;
            assert!(remaining.is_empty(), "all values should be written");
        });
        rx
    }
}

// Stub only to ensure this works as a binary
fn main() {}

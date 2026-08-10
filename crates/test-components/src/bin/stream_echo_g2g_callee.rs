mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-echo-g2g-callee",
    });
    export!(Component);
}

use wit_bindgen::StreamReader;

use bindings::exports::jco::test_components::stream_echo_source::Guest;
use bindings::wit_stream;

struct Component;

impl Guest for Component {
    // Echo pump across the composition: parks a read on the (transferred-in)
    // input stream before the caller performs its first write, echoing each
    // value +1 into the returned stream. The exporting task stays alive
    // (callback protocol) until the pump completes, which happens when the
    // input stream closes.
    async fn make_echo(mut input: StreamReader<u8>) -> StreamReader<u8> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            while let Some(v) = input.next().await {
                let remaining = tx.write_all(vec![v + 1]).await;
                assert!(remaining.is_empty(), "echo value should be written");
            }
            // input closed: dropping tx closes the echoed stream
        });
        rx
    }

    // Producer for the relay shape: the returned read end is
    // transferred out to the caller and then handed straight back into
    // make-echo, so both ends of this stream live inside this component
    // while the writer pump runs.
    async fn make_source(seed: u8) -> StreamReader<u8> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            let remaining = tx.write_all(vec![seed, seed + 1, seed + 2]).await;
            assert!(remaining.is_empty(), "all source values should be written");
        });
        rx
    }
}

// Stub only to ensure this works as a binary
fn main() {}

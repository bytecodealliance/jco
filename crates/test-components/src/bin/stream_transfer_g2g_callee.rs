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
    // of the fused call, *after* this component's task has been torn down.
    //
    // A sync-lifted export cannot leave detached work behind (there is no
    // async computation scope to adopt it): the `start_task` here gets exactly 
    // one inline poll (registering the pending stream write, which later 
    // rendezvouses with the caller's read), and is never polled again, so 
    // the writable end is never dropped. Callers must therefore do bounded 
    // reads, not read to close.
    fn make_stream(seed: u8) -> StreamReader<u8> {
        let (mut tx, rx) = wit_stream::new();
        start_task(async move {
            let remaining = tx.write_all(vec![seed, seed + 1, seed + 2]).await;
            assert!(remaining.is_empty(), "all values should be written");
        });
        rx
    }

    // The async-lifted shape for "return a stream, then keep writing": the
    // component-model task stays alive after returning the stream (callback
    // protocol) until the writer spawned via `spawn_local` completes, at
    // which point the writable end drops and the stream closes.
    async fn make_stream_async(seed: u8) -> StreamReader<u8> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            let remaining = tx.write_all(vec![seed, seed + 1, seed + 2]).await;
            assert!(remaining.is_empty(), "all values should be written");
        });
        rx
    }
}

// Stub only to ensure this works as a binary
fn main() {}

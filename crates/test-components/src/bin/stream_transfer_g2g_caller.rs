mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-transfer-g2g-caller",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::stream_transfer_runner::Guest;
use bindings::jco::test_components::stream_transfer_source;

struct Component;

impl Guest for Component {
    async fn run_stream_transfer(seed: u8) -> u32 {
        // Sync-lowered call to the composed callee; the returned stream end
        // is transferred into this component on the fused return path
        // (see lann/jco#35).
        let mut rx = stream_transfer_source::make_stream(seed);

        // NOTE: read exactly the three values the callee writes, rather than
        // collecting to stream close: the callee's detached writer task is
        // never driven again after its sync-lifted export returns, so the
        // writable end is never dropped and waiting for stream close would
        // park forever (a separate defect from the return-position transfer
        // exercised here).
        let mut sum = 0u32;
        for _ in 0..3 {
            let v = rx.next().await.expect("stream should yield a value");
            sum += u32::from(v);
        }
        sum
    }
}

// Stub only to ensure this works as a binary
fn main() {}

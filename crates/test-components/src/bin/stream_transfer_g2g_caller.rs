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

        // Read exactly the three values the callee writes without waiting
        // for stream close (a bounded read that stays deterministic even if
        // the callee's writer never runs again).
        let mut sum = 0u32;
        for _ in 0..3 {
            let v = rx.next().await.expect("stream should yield a value");
            sum += u32::from(v);
        }
        sum
    }

    async fn run_stream_transfer_all(seed: u8) -> u32 {
        // Async-lowered call to the async-lifted callee export: the callee
        // task stays alive until its spawned writer completes, so the
        // transferred stream reaches close and collect() terminates
        // (see lann/jco#39).
        let rx = stream_transfer_source::make_stream_async(seed).await;
        let vals: Vec<u8> = rx.collect().await;
        vals.into_iter().map(u32::from).sum()
    }
}

// Stub only to ensure this works as a binary
fn main() {}

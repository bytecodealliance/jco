mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-echo-g2g-caller",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::stream_echo_runner::Guest;
use bindings::jco::test_components::stream_echo_source;
use bindings::wit_stream;

struct Component;

impl Guest for Component {
    async fn run_stream_echo(seed: u8) -> u32 {
        let (mut tx, input_rx) = wit_stream::new();

        // The callee's echo pump parks a read on `input_rx` (transferred in
        // argument position) during this call, before our first write below:
        // the write must rendezvous with that parked cross-component read
        // and wake it.
        let echoed = stream_echo_source::make_echo(input_rx).await;

        // Write and read concurrently: the pump only reads the next input
        // value after its previous echo write completes, so the writer and
        // reader sides must both make progress for the exchange to finish.
        let write_side = async move {
            let remaining = tx.write_all(vec![seed, seed + 1, seed + 2]).await;
            assert!(remaining.is_empty(), "all values should be written");
            // dropping tx closes the input; the pump then closes the echoed
            // stream
        };
        let read_side = async move {
            let vals: Vec<u8> = echoed.collect().await;
            vals.into_iter().map(u32::from).sum::<u32>()
        };
        let ((), sum) = futures::join!(write_side, read_side);
        sum
    }

    async fn run_stream_relay(seed: u8) -> u32 {
        // The source stream's read end is transferred out of the callee
        // (return position) and straight back in (argument position of
        // make-echo), so both of its ends end up inside the callee while
        // the source's writer pump runs.
        let src = stream_echo_source::make_source(seed).await;
        let echoed = stream_echo_source::make_echo(src).await;
        let vals: Vec<u8> = echoed.collect().await;
        vals.into_iter().map(u32::from).sum()
    }
}

// Stub only to ensure this works as a binary
fn main() {}

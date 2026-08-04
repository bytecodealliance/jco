mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-export-future-result",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::async_export_future_result_api::Guest;
use bindings::{wit_future, wit_stream};
use wit_bindgen::rt::async_support::start_task;
use wit_bindgen::{FutureReader, StreamReader};

struct Component;

impl Guest for Component {
    fn prove_future(value: u32) -> FutureReader<u32> {
        let (tx, rx) =
            wit_future::new(|| unreachable!("future should be written by the guest task"));
        start_task(async move {
            let _ = tx.write(value + 2).await;
        });
        rx
    }

    async fn prove_async_func(value: u32) -> u32 {
        value + 1
    }

    fn prove_stream(_label: String) -> StreamReader<u8> {
        let (tx, rx) = wit_stream::new();
        drop(tx);
        rx
    }
}

fn main() {}

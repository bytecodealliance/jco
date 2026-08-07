mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "future-transfer-g2g-callee",
    });
    export!(Component);
}

use wit_bindgen::FutureReader;
use wit_bindgen::rt::async_support::start_task;

use bindings::exports::jco::test_components::future_transfer_source::Guest;
use bindings::wit_future;

struct Component;

impl Guest for Component {
    fn make_future(value: u32) -> FutureReader<u32> {
        let (tx, rx) =
            wit_future::new(|| unreachable!("future should be written by the guest task"));
        start_task(async move {
            let _ = tx.write(value + 1).await;
        });
        rx
    }
}

// Stub only to ensure this works as a binary
fn main() {}

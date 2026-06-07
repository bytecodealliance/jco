mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "pass-back-host-resolved-future-value",
    });
    export!(Component);
}

use wit_bindgen::FutureReader;

use bindings::exports::jco::test_components::local_run_async;
use bindings::send;
use bindings::wit_future::{self, FuturePayload};

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {
        assert_eq!(send(future_value_async(42)).await, 42);
    }
}

fn future_value_async<T: FuturePayload>(v: T) -> FutureReader<T> {
    let (tx, rx) = wit_future::new(|| unreachable!("default value should not be used"));
    wit_bindgen::spawn(async move {
        let _ = tx.write(v).await;
    });
    rx
}

// Stub only to ensure this works as a binary
fn main() {}

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "future-transfer-g2g-caller",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::future_transfer_runner::Guest;
use bindings::jco::test_components::future_transfer_source;

struct Component;

impl Guest for Component {
    async fn run_future_transfer(value: u32) -> u32 {
        future_transfer_source::make_future(value).await
    }
}

// Stub only to ensure this works as a binary
fn main() {}

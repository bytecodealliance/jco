mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-error-context",
    });
    export!(Component);
}

use wit_bindgen::rt::async_support::ErrorContext;

struct Component;

impl bindings::exports::jco::test_components::local_run::Guest for Component {
    async fn run() {
        let err_ctx = ErrorContext::new("error");
        assert_eq!("error", err_ctx.debug_message());
    }
}

// Stub only to ensure this works as a binary
fn main() {}

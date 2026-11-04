mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "instance-stop-spin" });
    export!(Component);
}

struct Component;

impl bindings::exports::jco::test_components::instance_stop_runner::Guest for Component {
    async fn run() {
        // Keep scheduling guest work without relying on any host I/O to end it.
        loop {
            wit_bindgen::rt::async_support::yield_async().await;
        }
    }

    fn ok() -> u32 {
        42
    }
}

fn main() {}

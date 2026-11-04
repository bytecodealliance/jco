mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "instance-stop-caller" });
    export!(Component);
}

use bindings::jco::test_components::instance_stop_runner;

struct Component;

impl bindings::exports::jco::test_components::instance_stop_runner::Guest for Component {
    async fn run() {
        instance_stop_runner::run().await;
    }

    fn ok() -> u32 {
        instance_stop_runner::ok()
    }
}

fn main() {}

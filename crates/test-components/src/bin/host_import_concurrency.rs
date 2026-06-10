mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "host-import-concurrency",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_async;
use bindings::jco::test_components::host_import_concurrency_host;

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {
        let (value, ()) = futures::join!(
            async { host_import_concurrency_host::wait().await },
            async { host_import_concurrency_host::signal().await },
        );

        assert_eq!(value, 42);
    }
}

fn main() {}

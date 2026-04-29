mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "future-concurrency",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_async;
use bindings::jco::test_components::future_concurrency_host;
use bindings::wit_stream;

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {
        let (mut tx, rx) = wit_stream::new();

        futures::join!(
            async {
                assert_eq!(future_concurrency_host::write_via_stream(rx).await, 42);
            },
            async {
                tx.write_all(vec![42]).await;
                drop(tx);
            },
        );
    }
}

fn main() {}

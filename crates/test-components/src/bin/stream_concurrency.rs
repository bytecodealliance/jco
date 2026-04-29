mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-concurrency",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::stream_concurrency_test;
use bindings::jco::test_components::stream_concurrency_host;
use wit_bindgen::StreamReader;

struct Component;

impl stream_concurrency_test::Guest for Component {
    async fn read_after_signal(mut rx: StreamReader<u8>) -> Vec<u8> {
        let (values, ()) = futures::join!(
            async {
                let mut values = Vec::new();
                while let Some(value) = rx.next().await {
                    values.push(value);
                }
                values
            },
            async {
                stream_concurrency_host::signal();
            },
        );
        values
    }
}

fn main() {}

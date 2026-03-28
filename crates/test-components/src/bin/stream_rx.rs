mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-rx",
    });
    export!(Component);
}

use wit_bindgen::StreamReader;

use bindings::exports::jco::test_components::use_stream_async;
use bindings::exports::jco::test_components::use_stream_sync;

struct Component;

impl use_stream_sync::Guest for Component {
    fn stream_passthrough(rx: StreamReader<u32>) -> StreamReader<u32> {
        rx
    }
}

impl use_stream_async::Guest for Component {
    async fn stream_passthrough(rx: StreamReader<u32>) -> StreamReader<u32> {
        rx
    }

    async fn read_stream_values_u32(rx: StreamReader<u32>) -> Vec<u32> {
        read_async_values(rx).await
    }

    async fn read_stream_values_s32(rx: StreamReader<i32>) -> Vec<i32> {
        read_async_values(rx).await
    }
}

async fn read_async_values<T>(mut rx: StreamReader<T>) -> Vec<T> {
    let mut vals = Vec::new();
    while let Some(v) = rx.next().await {
        vals.push(v);
    }
    vals
}

// Stub only to ensure this works as a binary
fn main() {}

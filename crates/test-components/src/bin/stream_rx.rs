use std::sync::atomic::AtomicU32;

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-rx",
    });
    export!(Component);
}

use wit_bindgen::StreamReader;

use bindings::exports::jco::test_components::use_stream_sync;
use bindings::wit_stream;
use bindings::wit_stream::StreamPayload;

struct Component;

impl use_stream_sync::Guest for Component {
    async fn stream_roundtrip(rx: StreamReader<u32>) -> Result<StreamReader<u32>, String> {
        Ok(rx)
    }
}

impl use_stream_async::Guest for Component {
    async fn read_stream_values(rx: StreamReader<u32>) -> Result<Vec<u32>, String> {
        let mut vals = Vec::new();
        while let Some(v) = rx.read().await {
            vals.push(v);
        }
        Ok(vals)
    }
}

// Stub only to ensure this works as a binary
fn main() {}

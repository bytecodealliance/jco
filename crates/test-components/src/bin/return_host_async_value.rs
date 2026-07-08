mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "return-host-async-value",
    });
    export!(Component);
}

use wit_bindgen::{FutureReader, StreamReader, StreamResult};

use bindings::wit_future;
use bindings::{compress, delay};

struct Component;

impl bindings::Guest for Component {
    async fn compress_passthrough(data: StreamReader<u8>) -> StreamReader<u8> {
        // Return the host import's result stream directly -- the export never
        // reads or re-emits the result bytes itself
        compress(data).await
    }

    async fn compress_collect(data: StreamReader<u8>) -> Vec<u8> {
        let mut rx = compress(data).await;
        let mut vals = Vec::new();
        loop {
            let (result, mut chunk) = rx.read(Vec::with_capacity(64)).await;
            vals.append(&mut chunk);
            if matches!(result, StreamResult::Dropped) {
                break;
            }
        }
        vals
    }

    async fn delay_roundtrip(v: u32) -> u32 {
        delay(future_value_async(v)).await.await
    }
}

fn future_value_async(v: u32) -> FutureReader<u32> {
    let (tx, rx) = wit_future::new(|| unreachable!("default value should not be used"));
    wit_bindgen::spawn_local(async move {
        let _ = tx.write(v).await;
    });
    rx
}

// Stub only to ensure this works as a binary
fn main() {}

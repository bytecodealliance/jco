mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "instance-stop-values" });
    export!(Component);
}

use wit_bindgen::rt::async_support::yield_async;
use wit_bindgen::{FutureReader, StreamReader};

struct Component;

impl bindings::Guest for Component {
    fn hold_future(value: FutureReader<u32>) {
        std::mem::forget(value);
    }

    fn hold_stream(value: StreamReader<u8>) {
        std::mem::forget(value);
    }

    async fn read_future(value: FutureReader<u32>) -> u32 {
        value.await
    }

    async fn read_stream(mut value: StreamReader<u8>) -> u8 {
        value.next().await.unwrap_or_default()
    }

    async fn make_future() -> FutureReader<u32> {
        let (writer, reader) = bindings::wit_future::new(|| unreachable!());
        wit_bindgen::spawn_local(async move {
            let _writer = writer;
            loop {
                yield_async().await;
            }
        });
        reader
    }

    async fn make_stream() -> StreamReader<u8> {
        let (writer, reader) = bindings::wit_stream::new();
        wit_bindgen::spawn_local(async move {
            let _writer = writer;
            loop {
                yield_async().await;
            }
        });
        reader
    }

    fn trap() {
        #[cfg(target_arch = "wasm32")]
        core::arch::wasm32::unreachable();
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!();
    }
}

fn main() {}

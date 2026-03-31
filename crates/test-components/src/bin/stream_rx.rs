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

use bindings::exports::jco::test_components::use_stream_async::{ExampleRecord, ExampleVariant};

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

    async fn read_stream_values_bool(rx: StreamReader<bool>) -> Vec<bool> {
        read_async_values(rx).await
    }

    async fn read_stream_values_u8(rx: StreamReader<u8>) -> Vec<u8> {
        read_async_values(rx).await
    }

    async fn read_stream_values_s8(rx: StreamReader<i8>) -> Vec<i8> {
        read_async_values(rx).await
    }

    async fn read_stream_values_u16(rx: StreamReader<u16>) -> Vec<u16> {
        read_async_values(rx).await
    }

    async fn read_stream_values_s16(rx: StreamReader<i16>) -> Vec<i16> {
        read_async_values(rx).await
    }

    async fn read_stream_values_u32(rx: StreamReader<u32>) -> Vec<u32> {
        read_async_values(rx).await
    }

    async fn read_stream_values_s32(rx: StreamReader<i32>) -> Vec<i32> {
        read_async_values(rx).await
    }

    async fn read_stream_values_u64(rx: StreamReader<u64>) -> Vec<u64> {
        read_async_values(rx).await
    }

    async fn read_stream_values_s64(rx: StreamReader<i64>) -> Vec<i64> {
        read_async_values(rx).await
    }

    async fn read_stream_values_f32(rx: StreamReader<f32>) -> Vec<f32> {
        read_async_values(rx).await
    }

    async fn read_stream_values_f64(rx: StreamReader<f64>) -> Vec<f64> {
        read_async_values(rx).await
    }

    async fn read_stream_values_string(rx: StreamReader<String>) -> Vec<String> {
        read_async_values(rx).await
    }

    async fn read_stream_values_record(rx: StreamReader<ExampleRecord>) -> Vec<ExampleRecord> {
        read_async_values(rx).await
    }

    async fn read_stream_values_variant(rx: StreamReader<ExampleVariant>) -> Vec<ExampleVariant> {
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

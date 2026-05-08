mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-lower",
    });
    export!(Component);
}

use wit_bindgen::{FutureReader, StreamReader};

use bindings::exports::jco::test_components::stream_lower_async;
use bindings::exports::jco::test_components::stream_lower_sync;
use bindings::jco::test_components::resources;

use bindings::exports::jco::test_components::stream_lower_async::{
    ExampleEnum, ExampleFlags, ExampleRecord, ExampleVariant, LayoutVariant, PaddedRecord,
    VariantStringRecord,
};

struct Component;

impl stream_lower_sync::Guest for Component {
    fn stream_passthrough(rx: StreamReader<u32>) -> StreamReader<u32> {
        rx
    }
}

impl stream_lower_async::Guest for Component {
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

    async fn read_stream_values_layout_variant(
        rx: StreamReader<LayoutVariant>,
    ) -> Vec<LayoutVariant> {
        read_async_values(rx).await
    }

    async fn read_stream_values_variant_string_record(
        rx: StreamReader<VariantStringRecord>,
    ) -> Vec<VariantStringRecord> {
        read_async_values(rx).await
    }

    async fn read_stream_values_option_string(
        rx: StreamReader<Option<String>>,
    ) -> Vec<Option<String>> {
        read_async_values(rx).await
    }

    async fn read_stream_values_result_string(
        rx: StreamReader<Result<String, String>>,
    ) -> Vec<Result<String, String>> {
        read_async_values(rx).await
    }

    async fn read_stream_values_tuple(
        rx: StreamReader<(u32, i32, String)>,
    ) -> Vec<(u32, i32, String)> {
        read_async_values(rx).await
    }

    async fn read_stream_values_tight_tuple(rx: StreamReader<(u8, u8, u32)>) -> Vec<(u8, u8, u32)> {
        read_async_values(rx).await
    }

    async fn read_stream_values_flags(rx: StreamReader<ExampleFlags>) -> Vec<ExampleFlags> {
        read_async_values(rx).await
    }

    async fn read_stream_values_enum(rx: StreamReader<ExampleEnum>) -> Vec<ExampleEnum> {
        read_async_values(rx).await
    }

    async fn read_stream_values_list_u8(rx: StreamReader<Vec<u8>>) -> Vec<Vec<u8>> {
        read_async_values(rx).await
    }

    async fn read_stream_values_list_string(rx: StreamReader<Vec<String>>) -> Vec<Vec<String>> {
        read_async_values(rx).await
    }

    async fn read_stream_values_fixed_list_u32(
        rx: StreamReader<Vec<[u32; 5]>>,
    ) -> Vec<Vec<[u32; 5]>> {
        read_async_values(rx).await
    }

    async fn read_stream_values_list_record(
        rx: StreamReader<Vec<ExampleRecord>>,
    ) -> Vec<Vec<ExampleRecord>> {
        read_async_values(rx).await
    }

    async fn read_stream_values_list_padded_record(
        rx: StreamReader<Vec<PaddedRecord>>,
    ) -> Vec<Vec<PaddedRecord>> {
        read_async_values(rx).await
    }

    async fn read_stream_values_example_resource_own(rx: StreamReader<resources::ExampleResource>) {
        let _ = read_async_values(rx).await;
        // All vals dropped at the end of this function
    }

    async fn read_stream_values_example_resource_own_attr(
        rx: StreamReader<resources::ExampleResource>,
    ) -> Vec<u32> {
        let vals = read_async_values::<resources::ExampleResource>(rx).await;
        vals.into_iter().map(|r| r.get_id()).collect()
    }

    async fn read_stream_values_stream_string(
        mut rx: StreamReader<StreamReader<String>>,
    ) -> Vec<Vec<String>> {
        let mut vals = Vec::new();
        while let Some(inner_rx) = rx.next().await {
            let inner_vals = read_async_values(inner_rx).await;
            vals.push(inner_vals);
        }
        vals
    }

    async fn read_stream_values_future_string(
        mut stream_rx: StreamReader<FutureReader<String>>,
    ) -> Vec<String> {
        let mut vals = Vec::new();
        while let Some(fut_rx) = stream_rx.next().await {
            vals.push(fut_rx.await);
        }
        vals
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

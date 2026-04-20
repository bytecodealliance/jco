mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "future-lower",
    });
    export!(Component);
}

use wit_bindgen::{FutureReader, StreamReader};

use bindings::exports::jco::test_components::future_lower_async;
use bindings::exports::jco::test_components::future_lower_sync;
use bindings::jco::test_components::resources;

use bindings::exports::jco::test_components::future_lower_async::{
    ExampleEnum, ExampleFlags, ExampleRecord, ExampleVariant,
};

struct Component;

impl future_lower_sync::Guest for Component {
    fn future_passthrough(rx: FutureReader<u32>) -> FutureReader<u32> {
        rx
    }
}

impl future_lower_async::Guest for Component {
    async fn future_passthrough(rx: FutureReader<u32>) -> FutureReader<u32> {
        rx
    }

    async fn read_future_value_bool(rx: FutureReader<bool>) -> bool {
        rx.await
    }

    async fn read_future_value_u8(rx: FutureReader<u8>) -> u8 {
        rx.await
    }

    async fn read_future_value_s8(rx: FutureReader<i8>) -> i8 {
        rx.await
    }

    async fn read_future_value_u16(rx: FutureReader<u16>) -> u16 {
        rx.await
    }

    async fn read_future_value_s16(rx: FutureReader<i16>) -> i16 {
        rx.await
    }

    async fn read_future_value_u32(rx: FutureReader<u32>) -> u32 {
        rx.await
    }

    async fn read_future_value_s32(rx: FutureReader<i32>) -> i32 {
        rx.await
    }

    async fn read_future_value_u64(rx: FutureReader<u64>) -> u64 {
        rx.await
    }

    async fn read_future_value_s64(rx: FutureReader<i64>) -> i64 {
        rx.await
    }

    async fn read_future_value_f32(rx: FutureReader<f32>) -> f32 {
        rx.await
    }

    async fn read_future_value_f64(rx: FutureReader<f64>) -> f64 {
        rx.await
    }

    async fn read_future_value_string(rx: FutureReader<String>) -> String {
        rx.await
    }

    async fn read_future_value_record(rx: FutureReader<ExampleRecord>) -> ExampleRecord {
        rx.await
    }

    async fn read_future_value_variant(rx: FutureReader<ExampleVariant>) -> ExampleVariant {
        rx.await
    }

    async fn read_future_value_option_string(rx: FutureReader<Option<String>>) -> Option<String> {
        rx.await
    }

    async fn read_future_value_result_string(
        rx: FutureReader<Result<String, String>>,
    ) -> Result<String, String> {
        rx.await
    }

    async fn read_future_value_tuple(rx: FutureReader<(u32, i32, String)>) -> (u32, i32, String) {
        rx.await
    }

    async fn read_future_value_flags(rx: FutureReader<ExampleFlags>) -> ExampleFlags {
        rx.await
    }

    async fn read_future_value_enum(rx: FutureReader<ExampleEnum>) -> ExampleEnum {
        rx.await
    }

    async fn read_future_value_list_u8(rx: FutureReader<Vec<u8>>) -> Vec<u8> {
        rx.await
    }

    async fn read_future_value_list_string(rx: FutureReader<Vec<String>>) -> Vec<String> {
        rx.await
    }

    async fn read_future_value_fixed_list_u32(rx: FutureReader<[u32; 5]>) -> [u32; 5] {
        rx.await
    }

    async fn read_future_value_list_record(
        rx: FutureReader<Vec<ExampleRecord>>,
    ) -> Vec<ExampleRecord> {
        rx.await
    }

    async fn read_future_value_example_resource_own(rx: FutureReader<resources::ExampleResource>) {
        let _ = rx.await;
        // All vals dropped at the end of this function
    }

    async fn read_future_value_example_resource_own_attr(
        rx: FutureReader<resources::ExampleResource>,
    ) -> u32 {
        rx.await.get_id()
    }

    async fn read_future_value_future_string(rx: FutureReader<FutureReader<String>>) -> String {
        rx.await.await
    }

    async fn read_future_value_stream_string(
        rx: FutureReader<StreamReader<String>>,
    ) -> Vec<String> {
        let s = rx.await;
        s.collect().await
    }
}

// Stub only to ensure this works as a binary
fn main() {}

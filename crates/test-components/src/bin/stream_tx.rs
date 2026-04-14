use std::sync::atomic::AtomicU32;

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-tx",
        with: {
            "jco:test-components/get-stream-async/example-guest-resource": generate,
        }
    });
    export!(Component);
}

use wit_bindgen::{FutureReader, StreamReader};

use bindings::exports::jco::test_components::get_stream_async;
use bindings::exports::jco::test_components::get_stream_async::GuestExampleGuestResource;
use bindings::jco::test_components::resources::ExampleResource;
use bindings::wit_stream;
use bindings::wit_stream::StreamPayload;

struct Component;

static RESOURCE_DISPOSE_COUNT: AtomicU32 = AtomicU32::new(0);

/// Guest-local implementation of `example-resource`
///
/// This resource is returned by component exported fucntions, but note
/// that is is *distinct* from the resource that is provided by the host
/// and passed in.
///
/// This component can look and behave and be linked to the external resource
/// implementation (forwarding calls to it), but it is *not* the same.
///
pub struct ExR(u32);

impl get_stream_async::GuestExampleGuestResource for ExR {
    fn new(id: u32) -> Self {
        ExR(id)
    }

    fn get_id(&self) -> u32 {
        self.0
    }

    async fn get_id_async(&self) -> u32 {
        self.0
    }
}

impl Drop for ExR {
    fn drop(&mut self) {
        RESOURCE_DISPOSE_COUNT.fetch_add(1, std::sync::atomic::Ordering::Release);
    }
}

impl get_stream_async::Guest for Component {
    type ExampleGuestResource = ExR;

    async fn get_stream_u32(vals: Vec<u32>) -> StreamReader<u32> {
        stream_values_async(vals)
    }

    async fn get_stream_s32(vals: Vec<i32>) -> StreamReader<i32> {
        stream_values_async(vals)
    }

    async fn get_stream_bool(vals: Vec<bool>) -> StreamReader<bool> {
        stream_values_async(vals)
    }

    async fn get_stream_u8(vals: Vec<u8>) -> StreamReader<u8> {
        stream_values_async(vals)
    }

    async fn get_stream_s8(vals: Vec<i8>) -> StreamReader<i8> {
        stream_values_async(vals)
    }

    async fn get_stream_u16(vals: Vec<u16>) -> StreamReader<u16> {
        stream_values_async(vals)
    }

    async fn get_stream_s16(vals: Vec<i16>) -> StreamReader<i16> {
        stream_values_async(vals)
    }

    async fn get_stream_u64(vals: Vec<u64>) -> StreamReader<u64> {
        stream_values_async(vals)
    }

    async fn get_stream_s64(vals: Vec<i64>) -> StreamReader<i64> {
        stream_values_async(vals)
    }

    async fn get_stream_f32(vals: Vec<f32>) -> StreamReader<f32> {
        stream_values_async(vals)
    }

    async fn get_stream_f64(vals: Vec<f64>) -> StreamReader<f64> {
        stream_values_async(vals)
    }

    async fn get_stream_string(vals: Vec<String>) -> StreamReader<String> {
        stream_values_async(vals)
    }

    async fn get_stream_record(
        vals: Vec<get_stream_async::ExampleRecord>,
    ) -> StreamReader<get_stream_async::ExampleRecord> {
        stream_values_async(vals)
    }

    async fn get_stream_variant(
        vals: Vec<get_stream_async::ExampleVariant>,
    ) -> StreamReader<get_stream_async::ExampleVariant> {
        stream_values_async(vals)
    }

    async fn get_stream_tuple(vals: Vec<(u32, i32, String)>) -> StreamReader<(u32, i32, String)> {
        stream_values_async(vals)
    }

    async fn get_stream_flags(
        vals: Vec<get_stream_async::ExampleFlags>,
    ) -> StreamReader<get_stream_async::ExampleFlags> {
        stream_values_async(vals)
    }

    async fn get_stream_enum(
        vals: Vec<get_stream_async::ExampleEnum>,
    ) -> StreamReader<get_stream_async::ExampleEnum> {
        stream_values_async(vals)
    }

    async fn get_stream_option_string(vals: Vec<Option<String>>) -> StreamReader<Option<String>> {
        stream_values_async(vals)
    }

    async fn get_stream_result_string(
        vals: Vec<Result<String, String>>,
    ) -> StreamReader<Result<String, String>> {
        stream_values_async(vals)
    }

    async fn get_stream_list_u8(vals: Vec<Vec<u8>>) -> StreamReader<Vec<u8>> {
        stream_values_async(vals)
    }

    async fn get_stream_list_string(vals: Vec<Vec<String>>) -> StreamReader<Vec<String>> {
        stream_values_async(vals)
    }

    async fn get_stream_list_record(
        vals: Vec<Vec<get_stream_async::ExampleRecord>>,
    ) -> StreamReader<Vec<get_stream_async::ExampleRecord>> {
        stream_values_async(vals)
    }

    async fn get_stream_fixed_list_u32(vals: Vec<[u32; 5]>) -> StreamReader<[u32; 5]> {
        stream_values_async(vals)
    }

    async fn get_stream_example_resource_own(
        vals: Vec<u32>,
    ) -> StreamReader<get_stream_async::ExampleGuestResource> {
        let resources = vals
            .iter()
            .map(|v| get_stream_async::ExampleGuestResource::new(ExR::new(*v)))
            .collect::<Vec<_>>();
        stream_values_async(resources)
    }

    fn get_example_resource_own_disposes() -> u32 {
        RESOURCE_DISPOSE_COUNT.load(std::sync::atomic::Ordering::Acquire)
    }

    async fn get_stream_example_resource_own_attr(vals: Vec<ExampleResource>) -> StreamReader<u32> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn(async move {
            for r in vals.iter() {
                tx.write(vec![r.get_id()]).await;
            }
        });
        rx
    }

    async fn get_stream_stream_string(vals: Vec<String>) -> StreamReader<StreamReader<String>> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn(async move {
            for v in vals {
                let (mut nested_tx, nested_rx) = wit_stream::new();
                tx.write(vec![nested_rx]).await;
                nested_tx.write(vec![v]).await;
            }
        });
        rx
    }

    async fn get_stream_future_string(
        vals: Vec<FutureReader<String>>,
    ) -> StreamReader<FutureReader<String>> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn(async move {
            for v in vals {
                tx.write_one(v).await;
            }
        });
        rx
    }
}

fn stream_values_async<T: StreamPayload>(vals: Vec<T>) -> StreamReader<T> {
    let (mut tx, rx) = wit_stream::new();
    wit_bindgen::spawn(async move {
        tx.write_all(vals).await;
    });
    rx
}

// Stub only to ensure this works as a binary
fn main() {}

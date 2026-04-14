use std::sync::atomic::AtomicU32;

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "future-tx",
        with: {
            "jco:test-components/get-future-async/example-guest-resource": generate,
        }
    });
    export!(Component);
}

use wit_bindgen::{FutureReader, StreamReader};

use bindings::exports::jco::test_components::get_future_async;
use bindings::exports::jco::test_components::get_future_async::GuestExampleGuestResource;
use bindings::jco::test_components::resources::ExampleResource;
use bindings::wit_future::FuturePayload;
use bindings::{wit_future, wit_stream};

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

impl get_future_async::GuestExampleGuestResource for ExR {
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

// NOTE: we need a default implementation
impl Default for get_future_async::ExampleRecord {
    fn default() -> Self {
        get_future_async::ExampleRecord {
            id: 0,
            id_str: "<default>".into(),
        }
    }
}

impl Drop for ExR {
    fn drop(&mut self) {
        RESOURCE_DISPOSE_COUNT.fetch_add(1, std::sync::atomic::Ordering::Release);
    }
}

impl get_future_async::Guest for Component {
    type ExampleGuestResource = ExR;

    async fn get_future_bool(v: bool) -> FutureReader<bool> {
        future_value_async(v)
    }

    async fn get_future_u32(v: u32) -> FutureReader<u32> {
        future_value_async(v)
    }

    async fn get_future_s32(v: i32) -> FutureReader<i32> {
        future_value_async(v)
    }

    async fn get_future_u8(vals: u8) -> FutureReader<u8> {
        future_value_async(vals)
    }

    async fn get_future_s8(vals: i8) -> FutureReader<i8> {
        future_value_async(vals)
    }

    async fn get_future_u16(vals: u16) -> FutureReader<u16> {
        future_value_async(vals)
    }

    async fn get_future_s16(vals: i16) -> FutureReader<i16> {
        future_value_async(vals)
    }

    async fn get_future_u64(vals: u64) -> FutureReader<u64> {
        future_value_async(vals)
    }

    async fn get_future_s64(vals: i64) -> FutureReader<i64> {
        future_value_async(vals)
    }

    async fn get_future_f32(vals: f32) -> FutureReader<f32> {
        future_value_async(vals)
    }

    async fn get_future_f64(vals: f64) -> FutureReader<f64> {
        future_value_async(vals)
    }

    async fn get_future_string(vals: String) -> FutureReader<String> {
        future_value_async(vals)
    }

    async fn get_future_record(
        vals: get_future_async::ExampleRecord,
    ) -> FutureReader<get_future_async::ExampleRecord> {
        future_value_async(vals)
    }

    async fn get_future_variant(
        v: get_future_async::ExampleVariant,
    ) -> FutureReader<get_future_async::ExampleVariant> {
        future_value_async(v)
    }

    async fn get_future_tuple(v: (u32, i32, String)) -> FutureReader<(u32, i32, String)> {
        future_value_async(v)
    }

    async fn get_future_flags(
        v: get_future_async::ExampleFlags,
    ) -> FutureReader<get_future_async::ExampleFlags> {
        future_value_async(v)
    }

    async fn get_future_enum(
        vals: get_future_async::ExampleEnum,
    ) -> FutureReader<get_future_async::ExampleEnum> {
        future_value_async(vals)
    }

    async fn get_future_option_string(vals: Option<String>) -> FutureReader<Option<String>> {
        future_value_async(vals)
    }

    async fn get_future_result_string(
        vals: Result<String, String>,
    ) -> FutureReader<Result<String, String>> {
        future_value_async(vals)
    }

    async fn get_future_list_u8(vals: Vec<u8>) -> FutureReader<Vec<u8>> {
        future_value_async(vals)
    }

    async fn get_future_list_string(vals: Vec<String>) -> FutureReader<Vec<String>> {
        future_value_async(vals)
    }

    async fn get_future_list_record(
        vals: Vec<get_future_async::ExampleRecord>,
    ) -> FutureReader<Vec<get_future_async::ExampleRecord>> {
        future_value_async(vals)
    }

    async fn get_future_fixed_list_u32(vals: [u32; 5]) -> FutureReader<[u32; 5]> {
        future_value_async(vals)
    }

    async fn get_future_example_resource_own(
        v: u32,
    ) -> FutureReader<get_future_async::ExampleGuestResource> {
        future_value_async(get_future_async::ExampleGuestResource::new(ExR::new(v)))
    }

    fn get_example_resource_own_disposes() -> u32 {
        RESOURCE_DISPOSE_COUNT.load(std::sync::atomic::Ordering::Acquire)
    }

    async fn get_future_future_string(v: String) -> FutureReader<FutureReader<String>> {
        let (tx, rx) = wit_future::new(|| unreachable!());
        wit_bindgen::spawn(async move {
            let (nested_tx, nested_rx) = wit_future::new(|| unreachable!());
            // NOTE: order here matters, we must first write the inner rx out before actually filling it
            let _ = tx.write(nested_rx).await;
            let _ = nested_tx.write(v).await;
        });
        rx
    }

    async fn get_future_example_resource_own_attr(v: ExampleResource) -> FutureReader<u32> {
        let (tx, rx) = wit_future::new(|| unreachable!());
        wit_bindgen::spawn(async move {
            let _ = tx.write(v.get_id()).await;
        });
        rx
    }

    // NOTE: Spool means this function will replay received values
    async fn get_future_stream_string_spool(
        vals: Vec<String>,
    ) -> FutureReader<StreamReader<String>> {
        let (future_tx, future_rx) = wit_future::new(|| unreachable!());
        let (mut stream_tx, stream_rx) = wit_stream::new();
        wit_bindgen::spawn(async move {
            let _ = future_tx.write(stream_rx).await;
            for v in vals {
                stream_tx.write_one(v).await;
            }
        });
        future_rx
    }

    async fn get_future_stream_string(
        v: StreamReader<String>,
    ) -> FutureReader<StreamReader<String>> {
        let (future_tx, future_rx) = wit_future::new(|| unreachable!());
        wit_bindgen::spawn(async move {
            let _ = future_tx.write(v).await;
        });
        future_rx
    }
}

fn future_value_async<T: FuturePayload>(v: T) -> FutureReader<T> {
    let (tx, rx) = wit_future::new(|| unreachable!("default value should not be used"));
    wit_bindgen::spawn(async move {
        let _ = tx.write(v).await;
    });
    rx
}

// Stub only to ensure this works as a binary
fn main() {}

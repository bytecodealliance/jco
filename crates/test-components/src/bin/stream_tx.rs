mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-tx",
    });
    export!(Component);
}

use bindings::wit_stream;
use wit_bindgen::StreamReader;

use crate::bindings::wit_stream::StreamPayload;

struct Component;

impl bindings::exports::jco::test_components::get_stream_async::Guest for Component {
    async fn get_stream_u32(vals: Vec<u32>) -> Result<StreamReader<u32>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_s32(vals: Vec<i32>) -> Result<StreamReader<i32>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_bool(vals: Vec<bool>) -> Result<StreamReader<bool>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_u8(vals: Vec<u8>) -> Result<StreamReader<u8>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_s8(vals: Vec<i8>) -> Result<StreamReader<i8>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_u16(vals: Vec<u16>) -> Result<StreamReader<u16>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_s16(vals: Vec<i16>) -> Result<StreamReader<i16>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_u64(vals: Vec<u64>) -> Result<StreamReader<u64>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_s64(vals: Vec<i64>) -> Result<StreamReader<i64>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_f32(vals: Vec<f32>) -> Result<StreamReader<f32>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_f64(vals: Vec<f64>) -> Result<StreamReader<f64>, String> {
        stream_values_async(vals)
    }
}

fn stream_values_async<T: StreamPayload>(vals: Vec<T>) -> Result<StreamReader<T>, String> {
    let (mut tx, rx) = wit_stream::new();
    wit_bindgen::spawn(async move {
        tx.write_all(vals).await;
    });
    Ok(rx)
}

// Stub only to ensure this works as a binary
fn main() {}

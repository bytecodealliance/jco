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

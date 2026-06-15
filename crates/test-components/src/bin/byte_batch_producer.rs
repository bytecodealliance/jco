mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "byte-batch-producer",
    });
    export!(Component);
}

use bindings::wit_stream;
use wit_bindgen::StreamReader;

use bindings::exports::jco::test_components::byte_batch_example;

struct Component;

const VALS: &[u8; 3] = &[0x01, 0x02, 0x03];

impl byte_batch_example::Guest for Component {
    async fn run() -> StreamReader<byte_batch_example::ByteBatch> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            tx.write_one(byte_batch_example::ByteBatch {
                bytes: VALS.to_vec(),
                len: u32::try_from(VALS.len()).unwrap(),
                msg: "example".into(),
            })
            .await;
        });
        rx
    }
}

// Stub only to ensure this works as a binary
fn main() {}

//! Return numeric lists and structured stream items to exercise host lifting.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "list-lift-copy" });
    export!(Component);
}

use bindings::wit_stream;
use wit_bindgen::StreamReader;

struct Component;
const BYTES: [u8; 16] = [
    0, 0, 0x80, 0x3f, 0, 0, 0, 0x40, 0, 0, 0, 0, 0, 0, 0xf0, 0x3f,
];

impl bindings::Guest for Component {
    fn get_u8() -> Vec<u8> {
        BYTES
            .chunks_exact(size_of::<u8>())
            .map(|bytes| u8::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_s8() -> Vec<i8> {
        BYTES
            .chunks_exact(size_of::<i8>())
            .map(|bytes| i8::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_u16() -> Vec<u16> {
        BYTES
            .chunks_exact(size_of::<u16>())
            .map(|bytes| u16::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_s16() -> Vec<i16> {
        BYTES
            .chunks_exact(size_of::<i16>())
            .map(|bytes| i16::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_u32() -> Vec<u32> {
        BYTES
            .chunks_exact(size_of::<u32>())
            .map(|bytes| u32::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_s32() -> Vec<i32> {
        BYTES
            .chunks_exact(size_of::<i32>())
            .map(|bytes| i32::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_u64() -> Vec<u64> {
        BYTES
            .chunks_exact(size_of::<u64>())
            .map(|bytes| u64::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_s64() -> Vec<i64> {
        BYTES
            .chunks_exact(size_of::<i64>())
            .map(|bytes| i64::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_f32() -> Vec<f32> {
        BYTES
            .chunks_exact(size_of::<f32>())
            .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }
    fn get_f64() -> Vec<f64> {
        BYTES
            .chunks_exact(size_of::<f64>())
            .map(|bytes| f64::from_le_bytes(bytes.try_into().unwrap()))
            .collect()
    }

    async fn open_lists(count: u32) -> StreamReader<Vec<u8>> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            tx.write_one((0..count).map(|n| (n + 1) as u8).collect())
                .await;
            tx.write_one(Vec::new()).await;
        });
        rx
    }

    async fn open_tuples() -> StreamReader<(Vec<u8>, u32)> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            tx.write_one((BYTES[..4].to_vec(), 7)).await;
            tx.write_one((BYTES[4..6].to_vec(), 9)).await;
        });
        rx
    }

    async fn open_nested() -> StreamReader<Vec<Vec<u16>>> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            tx.write_one(vec![vec![0, 0x3f80], vec![0]]).await;
        });
        rx
    }
}

fn main() {}

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "lift-list-before-fixed",
    });
    export!(Component);
}

use bindings::Blob;

struct Component;

impl bindings::Guest for Component {
    /// A record whose first field is a list, followed by a fixed-width `u32`
    /// and a `string`. Lifting `count` used to fail (jco#1585).
    async fn get_blob() -> Blob {
        Blob {
            data: vec![1, 2, 3, 4, 5],
            count: 42,
            label: "hello".into(),
        }
    }

    /// Same shape with an empty leading list: the element-buffer length is 0,
    /// so a naive "restore storageLen to the element length" fix would still
    /// leave the next field's budget at 0 and throw.
    async fn get_empty_blob() -> Blob {
        Blob {
            data: Vec::new(),
            count: 7,
            label: "empty".into(),
        }
    }

    /// Tuple variant of the same shape (list before a fixed-width field).
    async fn get_list_then_u32() -> (Vec<u8>, u32) {
        (vec![9, 8, 7], 1234)
    }
}

// Stub only to ensure this works as a binary
fn main() {}

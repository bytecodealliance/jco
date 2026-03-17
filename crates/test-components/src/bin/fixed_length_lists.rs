mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "fixed-length-lists",
    });
    export!(Component);
}

use crate::bindings::exports::jco::test_components::fixed_length_lists_fn::Guest;

struct Component;

impl Guest for Component {
    fn takes_returns_fixed(bools: [bool; 17]) -> Result<[u8; 32], String> {
        let mut bytes = [0u8; 32];
        bytes[..17].copy_from_slice(&bools.map(|b| b as u8));
        Ok(bytes)
    }
}

// Stub only to ensure this works as a binary
fn main() {}

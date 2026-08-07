mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "sync-to-async-callee",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::sync_lower_compute::Guest;

struct Component;

impl Guest for Component {
    // WIT-async export: async-lifted with the callback protocol. A composed
    // caller that *sync-lowers* this import reaches it through the fused
    // [sync-start] path (see lann/jco#45).
    async fn compute(x: u32) -> u32 {
        x + 3
    }

    // List results exceed one flat value, so the caller's sync lowering
    // receives them through a trailing return pointer.
    async fn compute_list(x: u32) -> Vec<u32> {
        vec![x, x + 1, x + 2]
    }
}

// Stub only to ensure this works as a binary
fn main() {}

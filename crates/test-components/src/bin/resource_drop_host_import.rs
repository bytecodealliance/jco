mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "resource-drop-host-import",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::dropped_resource;
use bindings::jco::test_components::tick;
use std::sync::OnceLock;

struct Component;

static INITIALIZED: OnceLock<u64> = OnceLock::new();

// Exercise every numeric core parameter type and an i64 result.
fn calculate() -> u64 {
    bindings::calculate(1, 2, 3.5, 4.5)
}

/// Initialization cannot suspend, even when the host import is marked async.
#[unsafe(no_mangle)]
pub extern "C" fn _initialize() {
    INITIALIZED.get_or_init(calculate);
}

impl dropped_resource::Guest for Component {
    type Thing = Thing;

    fn initialized() -> u64 {
        *INITIALIZED.get().expect("fixture was not initialized")
    }

    fn call_sync() -> u64 {
        calculate()
    }

    // The JS test marks this sync-typed export async to permit JSPI suspension.
    // A distinct core signature prevents merging with call_sync in optimized builds.
    fn call_async(a: u32) -> u64 {
        bindings::calculate(a, 2, 3.5, 4.5)
    }

    fn drop_in_guest() {
        drop(Thing);
    }
}

struct Thing;

impl dropped_resource::GuestThing for Thing {
    fn new() -> Self {
        Thing
    }
}

impl Drop for Thing {
    fn drop(&mut self) {
        tick::tick();
    }
}

// Stub only to ensure this works as a binary
fn main() {}

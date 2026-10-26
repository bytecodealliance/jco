mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "resource-drop-host-import",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::dropped_resource;
use bindings::jco::test_components::tick;

struct Component;

impl dropped_resource::Guest for Component {
    type Thing = Thing;
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

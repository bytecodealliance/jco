mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "resource-static-names-imports" });
    export!(Component);
}

use bindings::jco::test_components::static_names::Thing;

struct Component;

impl bindings::Guest for Component {
    fn run() -> u32 {
        Thing::prototype() + Thing::name() + Thing::length() + Thing::arguments() + Thing::caller()
    }
}

// Stub only to ensure this works as a binary
fn main() {}

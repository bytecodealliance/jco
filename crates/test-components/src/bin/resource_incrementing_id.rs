mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "resource-incrementing-id",
    });
    export!(Component);
}

struct Component;

impl bindings::exports::jco::test_components::local_run::Guest for Component {
    fn run() {
        // This component expects the import (the host, normally) to increment every time
        // getId() is called, which requires foo to have access to `this` on the outside,
        // and be called the right way.
        //
        // see: https://github.com/bytecodealliance/jco/issues/1313
        let ex = bindings::jco::test_components::resources::ExampleResource::new(0);
        assert_eq!(ex.get_id(), 1);
        assert_eq!(ex.get_id(), 2);
        assert_eq!(ex.get_id(), 3);
    }
}

// Stub only to ensure this works as a binary
fn main() {}

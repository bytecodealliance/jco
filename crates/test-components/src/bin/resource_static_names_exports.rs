mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "resource-static-names-exports" });
    export!(Component);
}

use bindings::exports::jco::test_components::static_names::{Guest, GuestOther, GuestThing};

struct Component;
struct Thing;
struct Other;

impl GuestThing for Thing {
    fn new() -> Self {
        Thing
    }

    fn prototype() -> u32 {
        11
    }

    fn name() -> u32 {
        12
    }

    fn length() -> u32 {
        13
    }

    fn arguments() -> u32 {
        14
    }

    fn caller() -> u32 {
        15
    }
}

impl GuestOther for Other {
    fn new() -> Self {
        Other
    }

    fn prototype(&self) -> u32 {
        16
    }
}

impl Guest for Component {
    type Thing = Thing;
    type Other = Other;
}

// Stub only to ensure this works as a binary
fn main() {}

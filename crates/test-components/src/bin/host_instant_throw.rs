mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "host-instant-throw",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run;
use bindings::jco::test_components::throw;

struct Component;

impl local_run::Guest for Component {
    fn run() {
        throw::throw();
    }
}

// Stub only to ensure this works as a binary
fn main() {}

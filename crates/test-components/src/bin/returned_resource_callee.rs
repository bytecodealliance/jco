mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "returned-resource-callee" });
    export!(Component);
}

use bindings::exports::jco::test_components::returned_resource_source::{Guest, GuestThing, Thing};

struct Component;
struct Value;
impl GuestThing for Value {}

impl Guest for Component {
    type Thing = Value;

    fn make() -> Thing {
        Thing::new(Value)
    }
}

fn main() {}

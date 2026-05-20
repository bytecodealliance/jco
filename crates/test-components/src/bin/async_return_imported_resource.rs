//! Regression component for the bindgen imported-own lift fix.

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-return-imported-resource",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::return_imported_resource_fns::Guest;
use bindings::jco::test_components::resources::ExampleResource;

struct Component;

impl Guest for Component {
    async fn get_resource_result(id: u32) -> Result<ExampleResource, String> {
        Ok(ExampleResource::new(id))
    }

    async fn get_resource(id: u32) -> ExampleResource {
        ExampleResource::new(id)
    }
}

fn main() {}

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-simple-return",
    });
    export!(Component);
}

struct Component;

impl bindings::Guest for Component {
    async fn get_u32() -> u32 {
        42
    }

    async fn get_string() -> String {
        "Hello World!".into()
    }

    async fn get_layout_variant_and_u32() -> (bindings::LayoutVariant, u32) {
        (bindings::LayoutVariant::Empty, 42)
    }
}

// Stub only to ensure this works as a binary
fn main() {}

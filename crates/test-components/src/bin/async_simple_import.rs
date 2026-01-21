mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-simple-import",
    });
    export!(Component);
}

struct Component;

impl bindings::Guest for Component {
    async fn get_u32() -> u32 {
        bindings::load_u32().await
    }

    async fn get_string() -> String {
        bindings::load_string().await
    }
}

// Stub only to ensure this works as a binary
fn main() {}

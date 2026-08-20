mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-host-import-hang",
    });
    export!(Component);
}

struct Component;

impl bindings::Guest for Component {
    async fn run() -> u32 {
        bindings::load().await
    }
}

// Stub only to ensure this works as a binary
fn main() {}

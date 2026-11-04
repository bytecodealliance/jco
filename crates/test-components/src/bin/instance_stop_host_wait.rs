mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "instance-stop-host-wait" });
    export!(Component);
}

struct Component;

impl bindings::Guest for Component {
    async fn run() {
        bindings::wait().await;
        bindings::completed();
    }
}

fn main() {}

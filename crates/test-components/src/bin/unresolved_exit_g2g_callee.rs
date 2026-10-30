mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "unresolved-exit-g2g-callee" });
    export!(Component);
}

struct Component;
impl bindings::exports::jco::test_components::unresolved_exit_source::Guest for Component {
    async fn consume(_input: wit_bindgen::StreamReader<()>) {
        core::future::pending::<()>().await;
    }
}

fn main() {}

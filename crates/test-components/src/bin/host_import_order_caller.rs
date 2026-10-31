//! The callee must finish its slice after task.return before this caller resumes.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "host-import-order-caller",
        sync: ["import:jco:test-components/host-import-order-source#return-then-import"],
    });
    export!(Component);
}
struct Component;
impl bindings::Guest for Component {
    async fn run() -> u32 {
        let value = bindings::jco::test_components::host_import_order_source::return_then_import();
        bindings::progress(2);
        value
    }
}
fn main() {}

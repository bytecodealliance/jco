mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "future-resource-caller" });
    export!(Component);
}
struct Component;
impl bindings::Guest for Component {
    async fn run(value: u32, delayed: bool) -> u32 {
        let item = bindings::jco::test_components::future_resource_source::make(value, delayed)
            .await
            .await;
        item.value()
    }
}
fn main() {}

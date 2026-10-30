mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "future-resource-callee" });
    export!(Component);
}

use bindings::exports::jco::test_components::future_resource_source::{Guest, GuestItem, Item};
use bindings::wit_future;
use wit_bindgen::FutureReader;

struct Component;
struct Value(u32);
impl GuestItem for Value {
    fn value(&self) -> u32 {
        self.0
    }
}
impl Drop for Value {
    fn drop(&mut self) {
        bindings::dropped(self.0);
    }
}
impl Guest for Component {
    type Item = Value;
    async fn make(value: u32, delayed: bool) -> FutureReader<Item> {
        let (tx, rx) = wit_future::new(|| unreachable!());
        wit_bindgen::spawn_local(async move {
            if delayed {
                bindings::ready().await;
            }
            let _ = tx.write(Item::new(Value(value))).await;
        });
        rx
    }
}
fn main() {}

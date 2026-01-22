mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-flat-param-adder",
    });
    export!(Component);
}

struct Component;

impl bindings::exports::jco::test_components::async_add_s32::Guest for Component {
    async fn add(a: i32, b: i32) -> Result<i32, String> {
        match a.overflowing_add(b) {
            (_, true) => Err("overflow".into()),
            (res, false) => Ok(res),
        }
    }
}

// Stub only to ensure this works as a binary
fn main() {}

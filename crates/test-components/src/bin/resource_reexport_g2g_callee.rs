//! Callee for the composed resource-reexport regression (lann/jco#51):
//! exports a resource together with an async function that returns an
//! owned instance of it across the (to-be-fused) component boundary.

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "resource-reexport-callee",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::reexport_source::{Guest, GuestWidget, Widget};

struct Component;

struct WidgetRes(u32);

impl GuestWidget for WidgetRes {
    fn poke(&self) -> u32 {
        self.0
    }
}

impl Guest for Component {
    type Widget = WidgetRes;

    async fn make_widget() -> Result<Widget, String> {
        Ok(Widget::new(WidgetRes(42)))
    }
}

// Stub only to ensure this works as a binary
fn main() {}

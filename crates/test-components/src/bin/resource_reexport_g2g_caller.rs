//! Caller for the composed resource-reexport regression:
//! calls the callee's async widget constructor across the fused boundary
//! and re-exports the callee's resource type in its own exported
//! interface (`reexport-handoff`) — the combination that makes the
//! generated taskReturn lift metadata reference the resource class above
//! its declaration (TDZ ReferenceError at import).

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "resource-reexport-caller",
        generate_all,
    });
    export!(Component);
}

use bindings::exports::jco::test_components::reexport_handoff::Guest as HandoffGuest;
use bindings::exports::jco::test_components::reexport_runner::Guest;
use bindings::jco::test_components::reexport_source::{Widget, make_widget};

struct Component;

impl Guest for Component {
    async fn run_reexport() -> Result<u32, String> {
        let widget = make_widget().await?;
        Ok(widget.poke())
    }
}

impl HandoffGuest for Component {
    async fn poke_widget(w: Widget) -> u32 {
        w.poke()
    }
}

// Stub only to ensure this works as a binary
fn main() {}

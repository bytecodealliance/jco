mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-g2g-spillover-callee",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::spillover_g2g_api::Guest;
use bindings::pause;

struct Component;

impl Guest for Component {
    async fn add5(p1: u32, p2: u32, p3: u32, p4: u32, p5: u32) -> u32 {
        p1 + p2 + p3 + p4 + p5
    }

    async fn concat3(a: String, b: String, c: u8) -> String {
        format!("{a}{b}{c}")
    }

    async fn add5_parked(p1: u32, p2: u32, p3: u32, p4: u32, p5: u32) -> u32 {
        // Force the task to park (WAIT) at least once before returning
        pause().await;
        p1 + p2 + p3 + p4 + p5
    }
}

// Stub only to ensure this works as a binary
fn main() {}

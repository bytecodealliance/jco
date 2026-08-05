mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-g2g-spillover-caller",
    });
    export!(Component);
}

use bindings::jco::test_components::spillover_g2g_api;

struct Component;

impl bindings::Guest for Component {
    async fn run_add5(p1: u32, p2: u32, p3: u32, p4: u32, p5: u32) -> u32 {
        spillover_g2g_api::add5(p1, p2, p3, p4, p5).await
    }

    async fn run_concat3(a: String, b: String, c: u8) -> String {
        spillover_g2g_api::concat3(a, b, c).await
    }

    async fn run_add5_parked(p1: u32, p2: u32, p3: u32, p4: u32, p5: u32) -> u32 {
        spillover_g2g_api::add5_parked(p1, p2, p3, p4, p5).await
    }
}

// Stub only to ensure this works as a binary
fn main() {}

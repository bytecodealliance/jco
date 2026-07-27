mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "argument-spillover",
    });
    export!(Component);
}

use bindings::jco::test_components::argument_spillover_host as host;

struct Component;

impl bindings::Guest for Component {
    fn sync_16(
        p01: u32,
        p02: u32,
        p03: u32,
        p04: u32,
        p05: u32,
        p06: u32,
        p07: u32,
        p08: u32,
        p09: u32,
        p10: u32,
        p11: u32,
        p12: u32,
        p13: u32,
        p14: u32,
        p15: u32,
        p16: u32,
    ) -> u32 {
        host::sync_16(
            p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11, p12, p13, p14, p15, p16,
        )
    }

    fn sync_18(
        p01: u32,
        p02: u32,
        p03: u32,
        p04: u32,
        p05: u32,
        p06: u32,
        p07: u32,
        p08: u32,
        p09: u32,
        p10: u32,
        p11: u32,
        p12: u32,
        p13: u32,
        p14: u32,
        p15: u32,
        p16: u32,
        p17: u32,
        p18: u32,
    ) -> u32 {
        host::sync_18(
            p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11, p12, p13, p14, p15, p16, p17,
            p18,
        )
    }

    async fn async_4(p01: u32, p02: u32, p03: u32, p04: u32) -> u32 {
        host::async_4(p01, p02, p03, p04).await
    }

    async fn async_5(p01: u32, p02: u32, p03: u32, p04: u32, p05: u32) -> u32 {
        host::async_5(p01, p02, p03, p04, p05).await
    }
}

fn main() {}

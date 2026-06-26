mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "host-call-loop-sync",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_n;
use bindings::jco::test_components::tick;

struct Component;

impl local_run_n::Guest for Component {
    fn run(n: u32) {
        for _ in 0..n {
            tick::tick();
        }
    }
}

// Stub only to ensure this works as a binary
fn main() {}

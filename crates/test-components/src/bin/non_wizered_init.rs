mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "basic-run-string",
    });
    export!(Component);
}

use crate::bindings::exports::jco::test_components::get_string;
use crate::bindings::exports::jco::test_components::local_run_string;

use std::sync::OnceLock;

struct Component;

static INIT_DATA: OnceLock<Option<String>> = OnceLock::new();

/// Initialization takes the ENV value of "TEST" (if present)
#[unsafe(no_mangle)]
pub extern "C" fn _initialize() {
    INIT_DATA.get_or_init(|| std::env::var("TEST").ok());
}

/// This version relies on the initialized data
impl local_run_string::Guest for Component {
    fn run() -> String {
        INIT_DATA
            .get()
            .expect("failed to get init data")
            .clone()
            .expect("missing string in init data")
    }
}

/// This version relies on the imported interface
impl get_string::Guest for Component {
    fn get_string() -> String {
        bindings::jco::test_components::get_string::get_string()
    }
}

// Stub only to ensure this works as a binary
fn main() {}

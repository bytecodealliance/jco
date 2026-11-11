mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "result-error-classes" });
    export!(Component);
}

use bindings::exports::jco::test_components::result_failures::{ErrorCode, Guest};

struct Component;

impl Guest for Component {
    fn check(fail: bool) -> Result<u32, ErrorCode> {
        if fail { Err(ErrorCode::Denied) } else { Ok(42) }
    }

    fn recheck(fail: bool) -> Result<(), ErrorCode> {
        if fail {
            Err(ErrorCode::NotFound)
        } else {
            Ok(())
        }
    }

    fn parse(fail: bool) -> Result<u32, String> {
        if fail { Err("bad input".into()) } else { Ok(7) }
    }
}

// Stub only to ensure this works as a binary
fn main() {}

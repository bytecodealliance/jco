mod bindings {
    wit_bindgen::generate!({
        world: "async-post-return-trap",
        // The shared fixture module provides this core export and its post-return hook.
        // Skip wit-bindgen's adapter for this function; keep its WIT declaration.
        // jco generates the JavaScript returnWithCleanup() wrapper from that declaration.
        skip: ["return-with-cleanup"],
    });

    use super::fixture::Component;
    export!(Component);
}

#[path = "support/post_return_trap.rs"]
mod fixture;

// Required because this fixture is built as a binary.
fn main() {}

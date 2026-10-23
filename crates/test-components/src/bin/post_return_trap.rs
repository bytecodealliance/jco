mod bindings {
    wit_bindgen::generate!({
        world: "post-return-trap",
        // The fixture supplies the core export and its post-return hook.
        skip: ["return-with-cleanup"],
    });

    use super::fixture::Component;
    export!(Component);
}

#[path = "support/post_return_trap.rs"]
mod fixture;

fn main() {}

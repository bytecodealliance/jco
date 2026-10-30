//! Rust-built fixture with deliberately unresolved raw callback exports.
//! The SDK normally guarantees task.return, so only the malformed exports
//! bypass its generated bodies, following the post-return-trap fixture pattern.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "unresolved-callback-exit",
        skip: ["exit-immediately", "exit-after-yield"],
    });
    export!(Component);
}

struct Component;
impl bindings::Guest for Component {
    async fn return_then_exit() -> u32 {
        42
    }
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[async-lift]exit-immediately")]
extern "C" fn exit_immediately() -> u32 {
    0
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[async-lift]exit-after-yield")]
extern "C" fn exit_after_yield() -> u32 {
    1
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[callback][async-lift]exit-immediately")]
extern "C" fn immediate_callback(_: u32, _: u32, _: u32) -> u32 {
    0
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[callback][async-lift]exit-after-yield")]
extern "C" fn yield_callback(_: u32, _: u32, _: u32) -> u32 {
    0
}

fn main() {}

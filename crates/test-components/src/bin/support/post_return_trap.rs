//! The core export returns its argument; only cleanup traps for nonzero values.

pub struct Component;

impl crate::bindings::Guest for Component {
    fn ok() -> u32 {
        42
    }
}

#[unsafe(export_name = "return-with-cleanup")]
extern "C" fn return_with_cleanup(value: u32) -> u32 {
    value
}

// Native fixture builds have no Wasm trap instruction.
#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "cabi_post_return-with-cleanup")]
extern "C" fn post_return(value: u32) {
    if value != 0 {
        core::arch::wasm32::unreachable();
    }
}

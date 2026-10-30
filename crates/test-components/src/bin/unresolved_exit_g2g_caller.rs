mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "unresolved-exit-g2g-caller",
        skip: ["run", "consume"],
    });
    export!(Component);
}

struct Component;
impl bindings::Guest for Component {
    fn ok() -> u32 {
        42
    }
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[stream-new-unit]"]
    fn stream_new() -> u64;
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "jco:test-components/unresolved-exit-source")]
unsafe extern "C" {
    #[link_name = "[async-lower]consume"]
    fn consume(input: u32) -> u32;
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[async-lift]run")]
extern "C" fn run() -> u32 {
    // Raw ABI use is necessary here: the caller deliberately exits without
    // task.return while a real Rust async callee still owns the moved stream.
    let packed = unsafe { consume(stream_new() as u32) };
    bindings::progress(packed);
    0
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[callback][async-lift]run")]
extern "C" fn callback(_: u32, _: u32, _: u32) -> u32 {
    0
}

fn main() {}

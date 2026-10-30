//! Deliberately invalid Canonical ABI operations in a Rust-built component.
//! Each test instantiates a fresh component: a trap poisons its store.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "invalid-handle-kinds", skip: ["payloads"] });
    export!(Component);
}

struct Component;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[waitable-set-new]"]
    fn set_new() -> u32;
    #[link_name = "[waitable-set-drop]"]
    fn set_drop(handle: u32);
    #[link_name = "[waitable-join]"]
    fn join(waitable: u32, set: u32);
    #[link_name = "[subtask-drop]"]
    fn subtask_drop(handle: u32);
    #[link_name = "[async-lower][subtask-cancel]"]
    fn subtask_cancel(handle: u32) -> u32;
    #[link_name = "[stream-new-0]payloads"]
    fn stream_new() -> u64;
    #[link_name = "[future-new-1]payloads"]
    fn future_new() -> u64;
    #[link_name = "[stream-new-2]payloads"]
    fn other_stream_new() -> u64;
    #[link_name = "[future-new-3]payloads"]
    fn other_future_new() -> u64;
    #[link_name = "[async-lower][stream-read-0]payloads"]
    fn stream_read(handle: u32, ptr: *mut u8, count: usize) -> u32;
    #[link_name = "[async-lower][future-read-1]payloads"]
    fn future_read(handle: u32, ptr: *mut u8) -> u32;
    #[link_name = "[stream-drop-readable-0]payloads"]
    fn stream_drop(handle: u32);
    #[link_name = "[future-drop-readable-1]payloads"]
    fn future_drop(handle: u32);
    #[link_name = "[error-context-drop]"]
    fn error_drop(handle: u32);
}

impl bindings::Guest for Component {
    fn run(case_index: u32) {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let ptr = core::ptr::null_mut();
            match case_index {
                0 => subtask_drop(stream_new() as u32),
                1 => subtask_drop(set_new()),
                2 => {
                    subtask_cancel(set_new());
                }
                3 => {
                    subtask_cancel(0);
                }
                4 => join(set_new(), 0),
                5 => join(65535, 0),
                6 => join(stream_new() as u32, stream_new() as u32),
                7 => set_drop(stream_new() as u32),
                8 => set_drop(0),
                9 => {
                    let stream = stream_new() as u32;
                    let set = set_new();
                    join(stream, set);
                    set_drop(set);
                }
                10 => {
                    stream_read(future_new() as u32, ptr, 1);
                }
                11 => {
                    future_read(stream_new() as u32, ptr);
                }
                12 => {
                    stream_read(other_stream_new() as u32, ptr, 1);
                }
                13 => {
                    future_read(other_future_new() as u32, ptr);
                }
                14 => stream_drop(future_new() as u32),
                15 => future_drop(stream_new() as u32),
                16 => error_drop(stream_new() as u32),
                17 => error_drop(0),
                18 => {
                    let stream = stream_new() as u32;
                    let set = set_new();
                    join(stream, set);
                    join(stream, 0);
                    set_drop(set);
                }
                19 => bindings::fail(),
                _ => unreachable!("unknown test case"),
            }
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }
}

fn main() {}

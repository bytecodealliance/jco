//! An async-lowered host call returns status without suspending the core stack.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "host-import-order", skip: ["return-then-import"] });
    export!(Component);
}

struct Component;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[async-lower]work"]
    fn start_work(value: u32, result: *mut u32) -> u32;
    #[link_name = "[async-lower]consume"]
    fn start_consume(handle: u32) -> u32;
}

static RESULTS: [std::sync::atomic::AtomicU32; 2] = [
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
];

impl bindings::Guest for Component {
    fn invalid_handle() {
        #[cfg(target_arch = "wasm32")]
        unsafe { start_consume(0); }
        bindings::progress(99);
    }

    fn start_two() -> (u32, u32) {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            (start_work(10, RESULTS[0].as_ptr()), start_work(20, RESULTS[1].as_ptr()))
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }

    fn results() -> (u32, u32) {
        use std::sync::atomic::Ordering::Relaxed;
        (RESULTS[0].load(Relaxed), RESULTS[1].load(Relaxed))
    }
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "[export]jco:test-components/host-import-order-source")]
unsafe extern "C" {
    #[link_name = "[task-return]return-then-import"]
    fn task_return(value: u32);
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[async-lift]jco:test-components/host-import-order-source#return-then-import")]
extern "C" fn return_then_import() -> u32 {
    unsafe {
        task_return(42);
        start_work(10, RESULTS[0].as_ptr());
    }
    bindings::progress(1);
    0 // EXIT: the host import must not interrupt this guest slice.
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[callback][async-lift]jco:test-components/host-import-order-source#return-then-import")]
extern "C" fn callback(_: u32, _: u32, _: u32) -> u32 {
    0
}

fn main() {}

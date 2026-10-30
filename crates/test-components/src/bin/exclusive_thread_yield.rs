//! Core thread.yield retains a sync/callback-lifted task's exclusive lock.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "exclusive-thread-yield",
        sync: ["export:run"],
        skip: ["park-callback"],
    });
    export!(Component);
}

struct Component;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[thread-yield]"]
    fn thread_yield() -> u32;
    #[link_name = "[thread-index]"]
    fn thread_index() -> u32;
    #[link_name = "[thread-suspend]"]
    fn thread_suspend() -> u32;
    #[link_name = "[thread-resume-later]"]
    fn thread_resume_later(index: u32);
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "[export]$root")]
unsafe extern "C" {
    #[link_name = "[task-return]park-callback"]
    fn return_park_callback(value: u32);
}

#[cfg(target_arch = "wasm32")]
static SYNC_THREAD: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(u32::MAX);

// Keep a resolved callback task parked so a later sync-typed export must
// run its callback to resume. Raw exports let us control callback scheduling.
#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[async-lift]park-callback")]
extern "C" fn park_callback() -> u32 {
    unsafe { return_park_callback(1) };
    1 // YIELD
}

#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "[callback][async-lift]park-callback")]
extern "C" fn parked_callback(_: u32, _: u32, _: u32) -> u32 {
    let index = SYNC_THREAD.load(std::sync::atomic::Ordering::Relaxed);
    if index == u32::MAX {
        return 1; // YIELD
    }
    unsafe { thread_resume_later(index) };
    0 // EXIT
}

fn yield_with_progress(value: u32) {
    bindings::progress(value * 10);
    #[cfg(target_arch = "wasm32")]
    unsafe {
        assert_eq!(thread_yield(), 0);
    }
    bindings::progress(value * 10 + 1);
}

impl bindings::Guest for Component {
    fn run(value: u32) {
        yield_with_progress(value);
    }

    async fn callback_run(value: u32) {
        yield_with_progress(value);
    }

    fn resume_callback() -> u32 {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            SYNC_THREAD.store(thread_index(), std::sync::atomic::Ordering::Relaxed);
            assert_eq!(thread_suspend(), 0);
        }
        42
    }
}

fn main() {}

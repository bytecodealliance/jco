//! Initialization must release its implicit thread's instance-scoped index.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "thread-indices" });
    export!(Component);
}

struct Component;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[thread-index]"]
    fn thread_index() -> u32;
    #[link_name = "[context-get-1]"]
    fn context_get() -> u32;
    #[link_name = "[thread-new-indirect-v0]"]
    fn thread_new(start: u32, context: u32) -> u32;
    #[link_name = "[thread-resume-later]"]
    fn thread_resume_later(index: u32);
    #[link_name = "[thread-yield]"]
    fn thread_yield() -> u32;
}

extern "C" fn child(context: u32) {
    bindings::progress(context);
}

impl bindings::Guest for Component {
    fn run() -> (u32, u32, u32) {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let index = thread_index();
            let context = context_get();
            let spawned = thread_new(child as *const () as u32, 42);
            thread_resume_later(spawned);
            assert_eq!(thread_yield(), 0);
            (index, spawned, context)
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }
}

fn main() {}

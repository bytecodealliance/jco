//! task.return must trap inside a synchronously lifted export.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "sync-task-return" });
    export!(Component);
}

struct Component;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "[export]$root")]
unsafe extern "C" {
    #[link_name = "[task-return]async-run"]
    fn task_return(value: u32);
}

impl bindings::Guest for Component {
    fn invalid_run() -> u32 {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            task_return(1);
        }
        bindings::continued();
        2
    }

    fn valid_run() -> u32 {
        42
    }

    async fn async_run() -> u32 {
        42
    }
}

fn main() {}

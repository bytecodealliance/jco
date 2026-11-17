//! The host resolves a future after its reader has suspended. Lowering the
//! value calls realloc, which must not disturb the suspended task's context.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "context-realloc-future-read" });
    export!(Component);
}

#[path = "support/context_realloc.rs"]
mod context_realloc;

use wit_bindgen::FutureReader;

struct Component;

impl bindings::Guest for Component {
    async fn run(value: FutureReader<String>) -> u32 {
        context_realloc::set_task_context();

        // The host resolves later, so this task suspends before the value is lowered.
        let value = value.await;

        context_realloc::assert_task_context();
        value.len() as u32
    }
}

fn main() {}

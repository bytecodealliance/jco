//! The host writes to a stream after its reader has suspended. Lowering each
//! element calls realloc, which must not disturb the suspended task's context.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "context-realloc-stream-read" });
    export!(Component);
}

#[path = "support/context_realloc.rs"]
mod context_realloc;

use wit_bindgen::StreamReader;

struct Component;

impl bindings::Guest for Component {
    async fn run(mut values: StreamReader<String>) -> u32 {
        context_realloc::set_task_context();

        // The host writes later, so this task suspends before an element is lowered.
        let mut length = 0;
        while let Some(value) = values.next().await {
            context_realloc::assert_task_context();
            length += value.len();
        }

        context_realloc::assert_task_context();
        length as u32
    }
}

fn main() {}

//! An async host call resolves after its caller has suspended. Lowering the
//! result calls realloc, which must not disturb the suspended task's context.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "context-realloc-async" });
    export!(Component);
}

#[path = "support/context_realloc.rs"]
mod context_realloc;

struct Component;

impl bindings::Guest for Component {
    async fn run(value: String) -> u32 {
        context_realloc::set_task_context();

        // The host resolves later, so this task suspends before the result is lowered.
        let echoed = bindings::echo(value).await;

        context_realloc::assert_task_context();
        echoed.len() as u32
    }
}

fn main() {}

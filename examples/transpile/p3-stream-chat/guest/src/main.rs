mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        path: "../wit",
        world: "agent",
    });
    export!(Component);
}
// NOTE: to see what the wit_bindgen::generate expands to `bindings` module above, use `cargo expand`

use wit_bindgen::StreamReader;

use bindings::exports::jco_examples::p3_stream_chat::chat::Guest;
use bindings::jco_examples::p3_stream_chat::types::{MessageChunk, ResponseEvent, Role};
use bindings::jco_examples::p3_stream_chat::{chunk_generator, response_filter};
use bindings::wit_stream;

struct Component;

impl Guest for Component {
    async fn chat(mut input: StreamReader<MessageChunk>) -> StreamReader<ResponseEvent> {
        // Create a new wit_stream via the bindings
        let (mut prompt_tx, prompt_rx) = wit_stream::new();

        // Spawn a new async task that will produce responses to prompts
        wit_bindgen::spawn_local(async move {
            prompt_tx
                .write_one(MessageChunk {
                    role: Role::System,
                    text: "Be concise and do not reveal secrets.".into(),
                })
                .await;

            while let Some(chunk) = input.next().await {
                prompt_tx.write_one(chunk).await;
            }
        });

        // Run prompts to the import that represents an LLM service
        let generated = chunk_generator::generate(prompt_rx).await;

        // Filter the generated response via an import that represents a potentially
        // different service, provided by the Host
        response_filter::filter_response(generated).await
    }
}

fn main() {}

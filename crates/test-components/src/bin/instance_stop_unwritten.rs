//! Exercise instance lifecycle with a Rust unwritten component.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "instance-stop-unwritten" });
    export!(Component);
}

use wit_bindgen::StreamReader;

struct Component;

impl bindings::Guest for Component {
    async fn start() -> (StreamReader<u8>, wit_bindgen::FutureReader<u8>) {
        let (stream, rx) = bindings::wit_stream::new();
        let (future, value) = bindings::wit_future::new(|| 0);
        wit_bindgen::spawn_local(async move {
            // Keep both writers alive without completing either channel.
            futures::future::pending::<()>().await;
            drop((stream, future));
        });
        (rx, value)
    }
}

fn main() {}

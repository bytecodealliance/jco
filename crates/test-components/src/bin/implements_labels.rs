//! Exercises the component model `implements` feature: the same interface
//! imported under two different labels, and exported under a label.

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "implements-labels",
    });
    export!(Component);
}

struct Component;

impl bindings::Guest for Component {
    fn echo_both(msg: String) -> (String, String) {
        (bindings::first::echo(&msg), bindings::second::echo(&msg))
    }
}

impl bindings::exports::relay::Guest for Component {
    fn echo(msg: String) -> String {
        // Relay through the `first` labeled import
        bindings::first::echo(&msg)
    }
}

// Stub only to ensure this works as a binary
fn main() {}

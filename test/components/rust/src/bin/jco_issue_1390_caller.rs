mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "fs-provider-read-borrow-consumer",
        generate_all,
    });
    export!(Component);
}

use bindings::test::jco_bug::fs_provider_read_borrow::{File, read_borrow};

struct Component;

impl bindings::exports::wasi::cli::run::Guest for Component {
    fn run() -> Result<(), ()> {
        let f = File::new("a");
        assert_eq!(read_borrow(&f), "f1");
        assert_eq!(f.size(), 101);
        assert_eq!(read_borrow(&f), "f1");
        assert_eq!(f.size(), 101);
        Ok(())
    }
}

// no-op
fn main() {}

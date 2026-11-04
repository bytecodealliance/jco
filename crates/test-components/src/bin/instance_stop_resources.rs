mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "instance-stop-resources" });
    export!(Component);
}

use bindings::exports::jco::test_components::instance_stop_guest;
use bindings::jco::test_components::instance_stop_host::{self, Thing};

struct Component;

impl bindings::Guest for Component {
    fn hold(value: Thing) {
        // Keep ownership in the guest until the host stops the instance.
        std::mem::forget(value);
    }

    fn borrow(_: &Thing) {}

    fn give_back(value: Thing) -> Thing {
        value
    }

    fn drop(value: Thing) {
        drop(value);
    }

    fn stop_with_borrow(_: &Thing) {
        instance_stop_host::stop();
        unreachable!("a stopped instance must not resume guest execution");
    }

    fn ok() -> u32 {
        42
    }

    fn trap() {
        #[cfg(target_arch = "wasm32")]
        core::arch::wasm32::unreachable();
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!();
    }
}

struct GuestThing(u32);

impl instance_stop_guest::Guest for Component {
    type Thing = GuestThing;
}

impl instance_stop_guest::GuestThing for GuestThing {
    fn new(rep: u32) -> Self {
        Self(rep)
    }
}

impl Drop for GuestThing {
    fn drop(&mut self) {
        instance_stop_host::destroyed(self.0);
    }
}

fn main() {}

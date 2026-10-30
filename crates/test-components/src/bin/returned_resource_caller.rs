mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "returned-resource-caller" });
    export!(Component);
}

struct Component;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[waitable-set-new]"]
    fn waitable_set_new() -> u32;
}

impl bindings::Guest for Component {
    fn run() -> (u32, u32) {
        let resource = bindings::jco::test_components::returned_resource_source::make();
        let handle = resource.handle();
        // Deliberately keep the resource alive without a resource.drop import:
        // the caller's resource table must be initialized by the transfer alone.
        core::mem::forget(resource);
        #[cfg(target_arch = "wasm32")]
        return (handle, unsafe { waitable_set_new() });
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }
}

fn main() {}

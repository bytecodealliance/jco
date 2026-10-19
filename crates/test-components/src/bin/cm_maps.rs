mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "cm-maps",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::cm_maps_api::{Guest, MapValue};
use bindings::jco::test_components::cm_maps_host;
use wit_bindgen::rt::Map;

struct Component;

impl Guest for Component {
    fn echo_strings(values: Map<String, u32>) -> Map<String, u32> {
        values
    }

    fn bigint_keys() -> Map<u64, String> {
        [(0, "zero".to_string()), (u64::MAX, "max".to_string())]
            .into_iter()
            .collect()
    }

    fn structured_values(values: Map<bool, MapValue>) -> Map<bool, MapValue> {
        values
    }

    fn host_roundtrip(values: Map<String, u32>) -> Map<String, u32> {
        cm_maps_host::roundtrip(&values)
    }

    /// Round-trips sibling maps through the host in a single call.
    fn host_roundtrip_siblings(
        first: Map<String, u32>,
        second: Map<String, u32>,
    ) -> (Map<String, u32>, Map<String, u32>) {
        cm_maps_host::roundtrip_siblings(&first, &second)
    }

    /// Round-trips nested maps through the host.
    fn host_roundtrip_nested(
        values: Map<String, Map<u32, String>>,
    ) -> Map<String, Map<u32, String>> {
        cm_maps_host::roundtrip_nested(&values)
    }

    /// Round-trips maps nested inside a list through the host.
    fn host_roundtrip_list(values: Vec<Map<String, u32>>) -> Vec<Map<String, u32>> {
        cm_maps_host::roundtrip_list(&values)
    }
}

fn main() {}

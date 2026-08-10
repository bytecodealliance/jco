mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-result-scalars",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::result_scalars_api::{Guest, NestedU64};

struct Component;

impl Guest for Component {
    async fn get_u64_ok(v: u64) -> Result<u64, String> {
        Ok(v)
    }

    async fn get_u64_err(msg: String) -> Result<u64, String> {
        Err(msg)
    }

    async fn get_s64_ok(v: i64) -> Result<i64, String> {
        Ok(v)
    }

    async fn get_f64_ok(v: f64) -> Result<f64, String> {
        Ok(v)
    }

    async fn get_f64_only(v: f64) -> Result<f64, f64> {
        Ok(v)
    }

    async fn get_f32_only(v: f32) -> Result<f32, f32> {
        Ok(v)
    }

    async fn get_option_u64(v: u64) -> Option<u64> {
        Some(v)
    }

    async fn get_option_f64(v: f64) -> Option<f64> {
        Some(v)
    }

    async fn get_option_f32(v: f32) -> Option<f32> {
        Some(v)
    }

    async fn get_record_u64(v: u64) -> Result<NestedU64, String> {
        Ok(NestedU64 { val: v, tag: 7 })
    }
}

// Stub only to ensure this works as a binary
fn main() {}

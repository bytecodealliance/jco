mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-lower-result-pointer",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_async;
use bindings::jco::test_components::async_lower_result_pointer_host;
use bindings::jco::test_components::sync_lower_result_pointer_host;

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {
        let sync_result = sync_lower_result_pointer_host::add_pair(1, 2, 3, 4, 5);
        assert_eq!(sync_result, (15, 120));

        let result = async_lower_result_pointer_host::add_five(1, 2, 3, 4, 5).await;
        assert_eq!(result, Ok(15));
    }
}

fn main() {}

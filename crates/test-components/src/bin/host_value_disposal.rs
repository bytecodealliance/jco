//! Test guest that cancels or discards host-provided async values before receiving them.
//!
//! The host is expected to be notified (by disposing the value it provided) whenever a
//! value is discarded, and never for values that were delivered to the guest.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "host-value-disposal",
    });
    export!(Component);
}

use std::future::IntoFuture as _;

use bindings::exports::jco::test_components::host_value_disposal_guest;
use bindings::jco::test_components::host_value_disposal_host as host;
use wit_bindgen::FutureReader;

struct Component;

impl host_value_disposal_guest::Guest for Component {
    async fn cancel_pending(n: u32) {
        let mut call = Box::pin(host::pending(n));

        // Poll once so the import call actually starts (the subtask is in-flight)
        let polled = futures::poll!(call.as_mut());
        assert!(polled.is_pending(), "pending resolved unexpectedly");

        // `call` is dropped here while in-flight -> `subtask.cancel`
    }

    async fn drop_future_unread() {
        drop(host::get_future());
    }

    async fn cancel_future_read() -> bool {
        let mut read = Box::pin(host::get_future().into_future());

        // Poll once so the read is started (and blocked on the host)
        let polled = futures::poll!(read.as_mut());
        assert!(polled.is_pending(), "future read resolved unexpectedly");

        // A cancelled read hands back the reader, which is dropped here
        read.as_mut().cancel().is_err()
    }

    async fn read_future() -> u32 {
        host::get_future().await
    }

    async fn consume_future(f: FutureReader<u32>) {
        drop(f);
    }

    async fn drop_stream_unread() {
        drop(host::get_stream());
    }
}

fn main() {}

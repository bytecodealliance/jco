//! Exercise future results from synchronous, native async, and JSPI exports.
use std::cell::RefCell;
use std::sync::atomic::{AtomicU32, Ordering};

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-export-future-result",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::async_export_future_result_api::Guest;
use bindings::{wit_future, wit_stream};
use wit_bindgen::rt::async_support::start_task;
use wit_bindgen::{FutureReader, FutureWriter, StreamReader};

struct Component;

static COMPLETED_FUTURE_WRITES: AtomicU32 = AtomicU32::new(0);

thread_local! {
    static READER: RefCell<Option<FutureReader<u32>>> = const { RefCell::new(None) };
}

/// Observe the rendezvous completing, rather than merely starting a write.
async fn write_value(writer: FutureWriter<u32>, value: u32) {
    if writer.write(value + 2).await.is_ok() {
        COMPLETED_FUTURE_WRITES.fetch_add(1, Ordering::Relaxed);
    }
}

impl Guest for Component {
    fn prove_future(value: u32) -> FutureReader<u32> {
        let (tx, rx) =
            wit_future::new(|| unreachable!("future should be written by the guest task"));
        start_task(async move {
            let _ = tx.write(value + 2).await;
        });
        rx
    }

    async fn prove_future_async(value: u32) -> FutureReader<u32> {
        let (tx, rx) =
            wit_future::new(|| unreachable!("future should be written by the guest task"));
        wit_bindgen::spawn_local(write_value(tx, value));
        rx
    }

    async fn prepare_future(value: u32) {
        // The async task owns the writer even when a sync export returns its reader.
        READER.replace(Some(Self::prove_future_async(value).await));
    }

    fn take_future() -> FutureReader<u32> {
        READER.take().unwrap()
    }

    fn completed_future_writes() -> u32 {
        COMPLETED_FUTURE_WRITES.load(Ordering::Relaxed)
    }

    async fn prove_async_func(value: u32) -> u32 {
        value + 1
    }

    fn prove_stream(_label: String) -> StreamReader<u8> {
        let (tx, rx) = wit_stream::new();
        drop(tx);
        rx
    }
}

fn main() {}

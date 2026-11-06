//! Keep failed writes owned by the guest until the host explicitly releases them.
use std::sync::Mutex;
use std::sync::atomic::{AtomicI32, Ordering};

mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "future-drop" });
    export!(Component);
}

use bindings::jco::test_components::future_drop_host::Thing;
use bindings::{wit_future, wit_stream};
use wit_bindgen::{FutureReader, FutureWriter, StreamReader, StreamWriter};

struct Component;

static READER: Mutex<Option<FutureReader<Thing>>> = Mutex::new(None);
static FUTURE: Mutex<Option<FutureWriter<Thing>>> = Mutex::new(None);
static STREAM: Mutex<Option<StreamWriter<Thing>>> = Mutex::new(None);
static HELD: Mutex<Option<Thing>> = Mutex::new(None);
static RESULT: AtomicI32 = AtomicI32::new(-2);

fn finished(value: Option<Thing>) {
    let result = if value.is_some() { 1 } else { 0 };
    let previous = std::mem::replace(&mut *HELD.lock().unwrap(), value);
    drop(previous);
    RESULT.store(result, Ordering::Release);
}

impl bindings::Guest for Component {
    async fn open_future(write_now: bool) -> FutureReader<Thing> {
        let (tx, rx) = wit_future::new(|| unreachable!("test always writes explicitly"));
        let previous = FUTURE.lock().unwrap().replace(tx);
        drop(previous);
        if write_now {
            wit_bindgen::spawn_local(Self::write_future());
        }
        rx
    }

    async fn open_nested_future() -> FutureReader<FutureReader<Thing>> {
        let inner = Self::open_future(true).await;
        let (tx, rx) = wit_future::new(|| unreachable!("test always writes explicitly"));
        wit_bindgen::spawn_local(async move {
            let _ = tx.write(inner).await;
        });
        rx
    }

    async fn prepare(write_now: bool) {
        let reader = Self::open_future(write_now).await;
        let previous = READER.lock().unwrap().replace(reader);
        drop(previous);
    }

    fn take_future() -> FutureReader<Thing> {
        READER.lock().unwrap().take().unwrap()
    }

    async fn write_future() {
        let tx = FUTURE.lock().unwrap().take().unwrap();
        finished(tx.write(Thing::new()).await.err().map(|error| error.value));
    }

    async fn discard(value: FutureReader<Thing>) {
        drop(value);
    }

    async fn open_stream() -> StreamReader<Thing> {
        let rx = Self::open_stream_idle().await;
        wit_bindgen::spawn_local(Self::write_stream());
        rx
    }

    async fn open_stream_idle() -> StreamReader<Thing> {
        let (tx, rx) = wit_stream::new();
        let previous = STREAM.lock().unwrap().replace(tx);
        drop(previous);
        rx
    }

    async fn write_stream() {
        let mut tx = STREAM.lock().unwrap().take().unwrap();
        finished(tx.write_one(Thing::new()).await);
    }

    fn write_result() -> i32 {
        RESULT.load(Ordering::Acquire)
    }

    fn drop_written() {
        let held = HELD.lock().unwrap().take();
        drop(held);
    }
}

fn main() {}

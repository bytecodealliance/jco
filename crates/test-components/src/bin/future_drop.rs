//! Keep failed writes owned by the guest until the host explicitly releases them.
use std::cell::{Cell, RefCell};

mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "future-drop" });
    export!(Component);
}

use bindings::jco::test_components::future_drop_host::Thing;
use bindings::{wit_future, wit_stream};
use wit_bindgen::{FutureReader, FutureWriter, StreamReader, StreamWriter};

struct Component;

thread_local! {
    static READER: RefCell<Option<FutureReader<Thing>>> = const { RefCell::new(None) };
    static FUTURE: RefCell<Option<FutureWriter<Thing>>> = const { RefCell::new(None) };
    static STREAM: RefCell<Option<StreamWriter<Thing>>> = const { RefCell::new(None) };
    static HELD: RefCell<Option<Thing>> = const { RefCell::new(None) };
    static RESULT: Cell<i32> = const { Cell::new(-2) };
}

fn finished(value: Option<Thing>) {
    RESULT.set(if value.is_some() { 1 } else { 0 });
    HELD.replace(value);
}

impl bindings::Guest for Component {
    async fn open_future(write_now: bool) -> FutureReader<Thing> {
        let (tx, rx) = wit_future::new(|| unreachable!("test always writes explicitly"));
        FUTURE.replace(Some(tx));
        if write_now {
            wit_bindgen::spawn_local(Self::write_future());
        }
        rx
    }

    async fn prepare(write_now: bool) {
        READER.replace(Some(Self::open_future(write_now).await));
    }

    fn take_future() -> FutureReader<Thing> {
        READER.take().unwrap()
    }

    async fn write_future() {
        let tx = FUTURE.take().unwrap();
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
        STREAM.replace(Some(tx));
        rx
    }

    async fn write_stream() {
        let mut tx = STREAM.take().unwrap();
        finished(tx.write_one(Thing::new()).await);
    }

    fn write_result() -> i32 {
        RESULT.get()
    }

    fn drop_written() {
        drop(HELD.take());
    }
}

fn main() {}

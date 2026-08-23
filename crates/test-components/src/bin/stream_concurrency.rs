mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-concurrency",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::stream_concurrency_test;
use bindings::jco::test_components::stream_concurrency_host;
use bindings::wit_stream;
use std::pin::pin;
use std::task::{Context, Poll, Waker};
use wit_bindgen::{StreamReader, StreamResult};

struct Component;

impl stream_concurrency_test::Guest for Component {
    async fn read_after_signal(mut rx: StreamReader<u8>) -> Vec<u8> {
        let (values, ()) = futures::join!(
            async {
                let mut values = Vec::new();
                while let Some(value) = rx.next().await {
                    values.push(value);
                }
                values
            },
            async {
                stream_concurrency_host::signal();
            },
        );
        values
    }

    async fn zero_read_after_cancel(mut rx: StreamReader<u8>) -> Vec<u8> {
        let (status, buf) = {
            let mut fut = pin!(rx.read(Vec::with_capacity(1)));
            let mut cx = Context::from_waker(Waker::noop());
            match fut.as_mut().poll(&mut cx) {
                Poll::Ready(pair) => pair,
                Poll::Pending => fut.cancel(),
            }
        };
        assert_eq!(status, StreamResult::Cancelled);
        assert!(buf.is_empty());

        let ((status, buf), ()) = futures::join!(
            async {
                let pair = rx.read(Vec::new()).await;
                stream_concurrency_host::zero_read_complete();
                pair
            },
            async {
                stream_concurrency_host::signal();
            },
        );
        assert_eq!(status, StreamResult::Complete(0));
        assert!(buf.is_empty());

        let mut values = Vec::new();
        while let Some(value) = rx.next().await {
            values.push(value);
        }
        values
    }

    async fn read_with_cancellation(mut rx: StreamReader<u8>) -> Vec<u8> {
        let mut values = Vec::new();
        let mut buffer = Vec::with_capacity(1024);
        let mut consecutive_cancellations = 0;

        loop {
            let (status, returned_buffer) = {
                let mut future = pin!(rx.read(buffer));
                let mut context = Context::from_waker(Waker::noop());
                match future.as_mut().poll(&mut context) {
                    Poll::Ready(result) => result,
                    Poll::Pending => future.cancel(),
                }
            };
            buffer = returned_buffer;

            match status {
                StreamResult::Complete(count) => {
                    assert_eq!(buffer.len(), count);
                    values.append(&mut buffer);
                    consecutive_cancellations = 0;
                }
                StreamResult::Dropped => break,
                StreamResult::Cancelled => {
                    assert!(consecutive_cancellations < 10);
                    consecutive_cancellations += 1;
                    rx.read(Vec::new()).await;
                }
            }
        }

        values
    }

    async fn write_until_dropped() -> StreamReader<u8> {
        let (mut tx, rx) = wit_stream::new();
        wit_bindgen::spawn_local(async move {
            loop {
                // Tell the host before every write. The regression test consumes
                // one value, waits until the next write is pending, then drops the
                // reader. That drop used to re-enter this producer before the
                // shared stream state was marked dropped and deadlock both sides.
                stream_concurrency_host::signal();
                let (status, _) = tx.write(vec![42]).await;
                if status == StreamResult::Dropped {
                    break;
                }
            }
            stream_concurrency_host::signal();
        });
        rx
    }
}

fn main() {}

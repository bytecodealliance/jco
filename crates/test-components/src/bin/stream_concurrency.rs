mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "stream-concurrency",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::stream_concurrency_test;
use bindings::jco::test_components::stream_concurrency_host;
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
}

fn main() {}

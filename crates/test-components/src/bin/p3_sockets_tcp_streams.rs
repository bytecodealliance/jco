//! This is a corrected local copy of Wasmtime's
//! `crates/test-programs/src/bin/p3_sockets_tcp_streams.rs`, taken from commit
//! 31c2c1db0a0f8162a763f2310e1f2037de44f1a8. The corresponding component is
//! generated with the other local Rust test components and is intentionally
//! not checked in.
//!
//! The upstream `test_tcp_read_cancellation` test has a race in its handling of
//! a zero-length read used to wait for stream readiness:
//!
//! - It polls and cancels an ordinary read.
//! - After a `cancelled` result, it awaits a zero-length read.
//! - It discards that readiness read's status and unconditionally starts
//!   another ordinary read.
//!
//! A zero-length read is still a Canonical ABI stream operation. It may report
//! `complete(0)`, `cancelled`, or `dropped`. The first two results leave the
//! stream open, but `dropped` is terminal. The Canonical ABI requires every
//! later operation on that stream end, other than `stream.drop-readable`, to
//! trap after `dropped` is reported. See the Component Model explainer's
//! `stream.read` and `stream.write` section:
//! https://github.com/WebAssembly/component-model/blob/main/design/mvp/Explainer.md#streamread-and-streamwrite
//!
//! Wasmtime's socket scheduling generally makes the readiness read complete
//! with `complete(0)` and reports EOF on the following ordinary read, so the
//! invalid extra operation is rarely exposed there. A Node-backed Jco stream
//! can observe EOF while the zero-length read is pending and correctly return
//! `dropped` from that read. The unmodified guest then performs its forbidden
//! extra read and traps.
//!
//! This copy therefore inspects the readiness status: it retries after
//! `complete(0)` or `cancelled`, stops after `dropped`, and explicitly drops the
//! readable stream before awaiting the separate receive-result future.
//!
//! TODO: Upstream this correction to Wasmtime and remove this local copy once
//! the upstream fixture contains the same terminal-status handling.

use futures::join;
use std::pin::pin;
use std::task::{Context, Poll, Waker};
use wit_bindgen::{FutureReader, StreamReader, StreamResult, StreamWriter};

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "p3-sockets-tcp-streams",
        generate_all,
    });
    export!(Component);
}

use bindings::exports::wasi::cli0_3_0::run;
use bindings::wasi::sockets0_3_0::types::{
    ErrorCode, IpAddressFamily, IpSocketAddress, Ipv4SocketAddress, Ipv6SocketAddress, TcpSocket,
};
use bindings::wit_stream;

struct Component;

fn supports_ipv6() -> bool {
    std::env::var("DISABLE_IPV6").is_err()
}

impl IpSocketAddress {
    const fn new_loopback(family: IpAddressFamily, port: u16) -> Self {
        match family {
            IpAddressFamily::Ipv4 => Self::Ipv4(Ipv4SocketAddress {
                port,
                address: (127, 0, 0, 1),
            }),
            IpAddressFamily::Ipv6 => Self::Ipv6(Ipv6SocketAddress {
                port,
                flow_info: 0,
                address: (0, 0, 0, 0, 0, 0, 0, 1),
                scope_id: 0,
            }),
        }
    }
}

/// Test basic functionality.
async fn test_tcp_ping_pong(family: IpAddressFamily) {
    setup(family, |mut server, mut client| async move {
        {
            let rest = server.send_stream.write_all(b"ping".into()).await;
            assert!(rest.is_empty());
        }
        {
            let (status, buf) = client.receive_stream.read(Vec::with_capacity(4)).await;
            assert_eq!(status, StreamResult::Complete(4));
            assert_eq!(buf, b"ping");
        }
        {
            let rest = client.send_stream.write_all(b"pong".into()).await;
            assert!(rest.is_empty());
        }
        {
            let (status, buf) = server.receive_stream.read(Vec::with_capacity(4)).await;
            assert_eq!(status, StreamResult::Complete(4));
            assert_eq!(buf, b"pong");
        }
    })
    .await;
}

/// The stream and future returned by `receive` should complete/resolve after
/// the connection has been shut down by the remote.
async fn test_tcp_receive_stream_should_be_dropped_by_remote_shutdown(family: IpAddressFamily) {
    setup(family, |server, mut client| async move {
        drop(server);

        // Wait for the shutdown signal to reach the client:
        let (stream_result, data) = client.receive_stream.read(Vec::with_capacity(1)).await;
        assert_eq!(data.len(), 0);
        assert_eq!(stream_result, StreamResult::Dropped);
        client.receive_result.await.unwrap();
    })
    .await;
}

/// The future returned by `receive` should resolve once the companion stream
/// has been dropped. Regardless of whether there was still data pending.
async fn test_tcp_receive_future_should_resolve_when_stream_dropped(family: IpAddressFamily) {
    setup(family, |mut server, client| async move {
        {
            let rest = server.send_stream.write_all(b"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.".into()).await;
            assert!(rest.is_empty());
        }
        {
            let Connection { mut receive_stream, receive_result, .. } = client;

            // Wait for the data to be ready:
            receive_stream.next().await.unwrap();
            drop(receive_stream);

            // Dropping the stream should've caused the future to resolve even
            // though there was still data pending:
            receive_result.await.unwrap();
        }
    }).await;
}

/// The future returned by `send` should resolve after the input stream is dropped.
async fn test_tcp_send_future_should_resolve_when_stream_dropped(family: IpAddressFamily) {
    setup(family, |_server, client| async move {
        let Connection {
            send_stream,
            send_result,
            ..
        } = client;
        drop(send_stream);
        send_result.await.unwrap();
    })
    .await;
}

/// `send` should drop the input stream when the connection is shut down by the remote.
async fn test_tcp_send_drops_stream_when_remote_shutdown(family: IpAddressFamily) {
    setup(family, |server, mut client| async move {
        drop(server);

        // Give it a few tries for the shutdown signal to reach the client:
        loop {
            let stream_result = client.send_stream.write(b"undeliverable".into()).await.0;
            if stream_result == StreamResult::Dropped {
                break;
            }
        }

        let result = client.send_result.await;
        assert!(
            matches!(
                result,
                Err(ErrorCode::ConnectionBroken | ErrorCode::ConnectionReset)
            ),
            "unexpected error {result:?}",
        );
    })
    .await;
}

/// `receive` may be called successfully at most once.
async fn test_tcp_receive_once(family: IpAddressFamily) {
    setup(family, |mut server, client| async move {
        // Give the client some potential data to _hopefully never_ read.
        {
            let rest = server.send_stream.write_all(b"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.".into()).await;
            assert!(rest.is_empty());
        }

        // FYI, the first call to `receive` is part of the `setup` code, so every
        // `receive` in here should fail.
        for _ in 0..3 {
            let (mut reader, future) = client.socket.receive();

            let (stream_result, data) = reader.read(Vec::with_capacity(10)).await;
            assert_eq!(data.len(), 0);
            assert_eq!(stream_result, StreamResult::Dropped);
            assert!(matches!(future.await, Err(ErrorCode::InvalidState)));
        }
    })
    .await;
}

/// `send` may be called successfully at most once.
async fn test_tcp_send_once(family: IpAddressFamily) {
    setup(family, |_server, client| async move {
        // FYI, the first call to `send` is part of the `setup` code, so every
        // `send` in here should fail.
        for _ in 0..3 {
            let (mut writer, send_rx) = wit_stream::new();
            let future = client.socket.send(send_rx);

            const DATA: &[u8] = b"undeliverable";
            let (stream_result, rest) = writer.write(DATA.into()).await;
            assert_eq!(rest.into_vec(), DATA);
            assert_eq!(stream_result, StreamResult::Dropped);
            assert!(matches!(future.await, Err(ErrorCode::InvalidState)));
        }
    })
    .await;
}

/// The streams and futures returned by `send` and `receive` should remain
/// operational even after the socket that spawned them has been dropped.
async fn test_tcp_stream_lifetimes(family: IpAddressFamily) {
    setup(family, |server, client| async move {
        let Connection {
            socket: server_socket,
            send_stream: mut server_send_stream,
            receive_stream: server_receive_stream,
            send_result: server_send_result,
            receive_result: server_receive_result,
        } = server;
        let Connection {
            socket: client_socket,
            send_stream: mut client_send_stream,
            receive_stream: client_receive_stream,
            send_result: client_send_result,
            receive_result: client_receive_result,
        } = client;

        // Drop the parent sockets:
        drop(server_socket);
        drop(client_socket);

        {
            let rest = server_send_stream.write_all(b"ping".into()).await;
            assert!(rest.is_empty());
            drop(server_send_stream);
            server_send_result.await.unwrap();
        }
        {
            let data = client_receive_stream.collect().await;
            assert_eq!(data, b"ping");
            client_receive_result.await.unwrap();
        }
        {
            let rest = client_send_stream.write_all(b"pong".into()).await;
            assert!(rest.is_empty());
            drop(client_send_stream);
            client_send_result.await.unwrap();
        }
        {
            let data = server_receive_stream.collect().await;
            assert_eq!(data, b"pong");
            server_receive_result.await.unwrap();
        }
    })
    .await;
}

/// Model a situation where there's a continuous stream of data coming into the
/// guest from one side and the other side is reading in chunks but also
/// cancelling reads occasionally. Should receive the complete stream of data
/// into the result.
async fn test_tcp_read_cancellation(family: IpAddressFamily) {
    // Send 2M of data in 256-byte chunks.
    const CHUNKS: usize = (2 << 20) / 256;
    let mut data = [0; 256];
    for (i, slot) in data.iter_mut().enumerate() {
        *slot = i as u8;
    }

    setup(family, |mut server, mut client| async move {
        // Minimize the local send buffer:
        client.socket.set_send_buffer_size(1024).unwrap();

        join!(
            async {
                for _ in 0..CHUNKS {
                    let ret = client.send_stream.write_all(data.to_vec()).await;
                    assert!(ret.is_empty());
                }
                drop(client.send_stream);
            },
            async {
                let mut buf = Vec::with_capacity(1024);
                let mut i = 0_usize;
                let mut consecutive_zero_length_reads = 0;
                loop {
                    assert!(buf.is_empty());
                    let (status, b) = {
                        let mut fut = pin!(server.receive_stream.read(buf));
                        let mut cx = Context::from_waker(Waker::noop());
                        match fut.as_mut().poll(&mut cx) {
                            Poll::Ready(pair) => pair,
                            Poll::Pending => fut.cancel(),
                        }
                    };
                    buf = b;
                    match status {
                        StreamResult::Complete(n) => {
                            assert_eq!(buf.len(), n);
                            for slot in buf.iter_mut() {
                                assert_eq!(*slot, i as u8);
                                i = i.wrapping_add(1);
                            }
                            buf.truncate(0);
                            consecutive_zero_length_reads = 0;
                        }
                        StreamResult::Dropped => break,
                        StreamResult::Cancelled => {
                            assert!(consecutive_zero_length_reads < 10);
                            consecutive_zero_length_reads += 1;
                            match server.receive_stream.read(Vec::new()).await.0 {
                                StreamResult::Complete(0) | StreamResult::Cancelled => {}
                                StreamResult::Dropped => break,
                                status => panic!("unexpected readiness read status: {status:?}"),
                            }
                        }
                    }
                }
                assert_eq!(i, CHUNKS * 256);
                drop(server.receive_stream);
                server.receive_result.await.unwrap();
            },
        );
    })
    .await;
}

impl run::Guest for Component {
    async fn run() -> Result<(), ()> {
        test_tcp_ping_pong(IpAddressFamily::Ipv4).await;
        test_tcp_receive_stream_should_be_dropped_by_remote_shutdown(IpAddressFamily::Ipv4).await;
        test_tcp_receive_future_should_resolve_when_stream_dropped(IpAddressFamily::Ipv4).await;
        test_tcp_send_future_should_resolve_when_stream_dropped(IpAddressFamily::Ipv4).await;
        test_tcp_send_drops_stream_when_remote_shutdown(IpAddressFamily::Ipv4).await;
        test_tcp_receive_once(IpAddressFamily::Ipv4).await;
        test_tcp_send_once(IpAddressFamily::Ipv4).await;
        test_tcp_stream_lifetimes(IpAddressFamily::Ipv4).await;
        test_tcp_read_cancellation(IpAddressFamily::Ipv4).await;

        if supports_ipv6() {
            test_tcp_ping_pong(IpAddressFamily::Ipv6).await;
            test_tcp_receive_stream_should_be_dropped_by_remote_shutdown(IpAddressFamily::Ipv6)
                .await;
            test_tcp_receive_future_should_resolve_when_stream_dropped(IpAddressFamily::Ipv6).await;
            test_tcp_send_future_should_resolve_when_stream_dropped(IpAddressFamily::Ipv6).await;
            test_tcp_send_drops_stream_when_remote_shutdown(IpAddressFamily::Ipv6).await;
            test_tcp_receive_once(IpAddressFamily::Ipv6).await;
            test_tcp_send_once(IpAddressFamily::Ipv6).await;
            test_tcp_stream_lifetimes(IpAddressFamily::Ipv6).await;
            test_tcp_read_cancellation(IpAddressFamily::Ipv6).await;
        }
        Ok(())
    }
}

fn main() {}

struct Connection {
    socket: TcpSocket,
    receive_stream: StreamReader<u8>,
    receive_result: FutureReader<Result<(), ErrorCode>>,
    send_stream: StreamWriter<u8>,
    send_result: FutureReader<Result<(), ErrorCode>>,
}
impl Connection {
    fn new(socket: TcpSocket) -> Self {
        let (send_stream, send_rx) = wit_stream::new();
        let send_result = socket.send(send_rx);
        let (receive_stream, receive_result) = socket.receive();
        Self {
            socket,
            receive_stream,
            receive_result,
            send_stream,
            send_result,
        }
    }
}

/// Set up a connected pair of sockets
async fn setup<Fut: Future<Output = ()>>(
    family: IpAddressFamily,
    body: impl FnOnce(Connection, Connection) -> Fut,
) {
    let bind_address = IpSocketAddress::new_loopback(family, 0);
    let listener = TcpSocket::create(family).unwrap();
    listener.bind(bind_address).unwrap();
    let mut accept = listener.listen().unwrap();
    let bound_address = listener.get_local_address().unwrap();
    let client_socket = TcpSocket::create(family).unwrap();
    let ((), accepted_socket) = join!(
        async {
            client_socket.connect(bound_address).await.unwrap();
        },
        async { accept.next().await.unwrap() },
    );

    body(
        Connection::new(accepted_socket),
        Connection::new(client_socket),
    )
    .await;
}

/** @module Interface wasi:sockets/types@0.3.0-rc-2026-02-09 **/
export type Duration = import('./wasi-clocks-types.js').Duration;
/**
 * Error codes.
 * 
 * In theory, every API can return any error code.
 * In practice, API's typically only return the errors documented per API
 * combined with a couple of errors that are always possible:
 * - `unknown`
 * - `access-denied`
 * - `not-supported`
 * - `out-of-memory`
 * 
 * See each individual API for what the POSIX equivalents are. They sometimes differ per API.
 * # Variants
 * 
 * ## `"unknown"`
 * 
 * Unknown error
 * ## `"access-denied"`
 * 
 * Access denied.
 * 
 * POSIX equivalent: EACCES, EPERM
 * ## `"not-supported"`
 * 
 * The operation is not supported.
 * 
 * POSIX equivalent: EOPNOTSUPP
 * ## `"invalid-argument"`
 * 
 * One of the arguments is invalid.
 * 
 * POSIX equivalent: EINVAL
 * ## `"out-of-memory"`
 * 
 * Not enough memory to complete the operation.
 * 
 * POSIX equivalent: ENOMEM, ENOBUFS, EAI_MEMORY
 * ## `"timeout"`
 * 
 * The operation timed out before it could finish completely.
 * ## `"invalid-state"`
 * 
 * The operation is not valid in the socket's current state.
 * ## `"address-not-bindable"`
 * 
 * A bind operation failed because the provided address is not an address that the `network` can bind to.
 * ## `"address-in-use"`
 * 
 * A bind operation failed because the provided address is already in use or because there are no ephemeral ports available.
 * ## `"remote-unreachable"`
 * 
 * The remote address is not reachable
 * ## `"connection-refused"`
 * 
 * The TCP connection was forcefully rejected
 * ## `"connection-reset"`
 * 
 * The TCP connection was reset.
 * ## `"connection-aborted"`
 * 
 * A TCP connection was aborted.
 * ## `"datagram-too-large"`
 * 
 * The size of a datagram sent to a UDP socket exceeded the maximum
 * supported size.
 */
export type ErrorCode = 'unknown' | 'access-denied' | 'not-supported' | 'invalid-argument' | 'out-of-memory' | 'timeout' | 'invalid-state' | 'address-not-bindable' | 'address-in-use' | 'remote-unreachable' | 'connection-refused' | 'connection-reset' | 'connection-aborted' | 'datagram-too-large';
/**
 * # Variants
 * 
 * ## `"ipv4"`
 * 
 * Similar to `AF_INET` in POSIX.
 * ## `"ipv6"`
 * 
 * Similar to `AF_INET6` in POSIX.
 */
export type IpAddressFamily = 'ipv4' | 'ipv6';
export type Ipv4Address = [number, number, number, number];
export type Ipv6Address = [number, number, number, number, number, number, number, number];
export type IpAddress = IpAddressIpv4 | IpAddressIpv6;
export interface IpAddressIpv4 {
  tag: 'ipv4',
  val: Ipv4Address,
}
export interface IpAddressIpv6 {
  tag: 'ipv6',
  val: Ipv6Address,
}
export interface Ipv4SocketAddress {
  /**
   * sin_port
   */
  port: number,
  /**
   * sin_addr
   */
  address: Ipv4Address,
}
export interface Ipv6SocketAddress {
  /**
   * sin6_port
   */
  port: number,
  /**
   * sin6_flowinfo
   */
  flowInfo: number,
  /**
   * sin6_addr
   */
  address: Ipv6Address,
  /**
   * sin6_scope_id
   */
  scopeId: number,
}
export type IpSocketAddress = IpSocketAddressIpv4 | IpSocketAddressIpv6;
export interface IpSocketAddressIpv4 {
  tag: 'ipv4',
  val: Ipv4SocketAddress,
}
export interface IpSocketAddressIpv6 {
  tag: 'ipv6',
  val: Ipv6SocketAddress,
}
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

export class TcpSocket {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  /**
  * Create a new TCP socket.
  * 
  * Similar to `socket(AF_INET or AF_INET6, SOCK_STREAM, IPPROTO_TCP)` in POSIX.
  * On IPv6 sockets, IPV6_V6ONLY is enabled by default and can't be configured otherwise.
  * 
  * Unlike POSIX, WASI sockets have no notion of a socket-level
  * `O_NONBLOCK` flag. Instead they fully rely on the Component Model's
  * async support.
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/socket.html>
  * - <https://man7.org/linux/man-pages/man2/socket.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-wsasocketw>
  * - <https://man.freebsd.org/cgi/man.cgi?query=socket&sektion=2>
  */
  static create(addressFamily: IpAddressFamily): TcpSocket;
  /**
  * Bind the socket to the provided IP address and port.
  * 
  * If the IP address is zero (`0.0.0.0` in IPv4, `::` in IPv6), it is left to the implementation to decide which
  * network interface(s) to bind to.
  * If the TCP/UDP port is zero, the socket will be bound to a random free port.
  * 
  * Bind can be attempted multiple times on the same socket, even with
  * different arguments on each iteration. But never concurrently and
  * only as long as the previous bind failed. Once a bind succeeds, the
  * binding can't be changed anymore.
  * 
  * # Typical errors
  * - `invalid-argument`:          The `local-address` has the wrong address family. (EAFNOSUPPORT, EFAULT on Windows)
  * - `invalid-argument`:          `local-address` is not a unicast address. (EINVAL)
  * - `invalid-argument`:          `local-address` is an IPv4-mapped IPv6 address. (EINVAL)
  * - `invalid-state`:             The socket is already bound. (EINVAL)
  * - `address-in-use`:            No ephemeral ports available. (EADDRINUSE, ENOBUFS on Windows)
  * - `address-in-use`:            Address is already in use. (EADDRINUSE)
  * - `address-not-bindable`:      `local-address` is not an address that can be bound to. (EADDRNOTAVAIL)
  * 
  * # Implementors note
  * When binding to a non-zero port, this bind operation shouldn't be affected by the TIME_WAIT
  * state of a recently closed socket on the same local address. In practice this means that the SO_REUSEADDR
  * socket option should be set implicitly on all platforms, except on Windows where this is the default behavior
  * and SO_REUSEADDR performs something different entirely.
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/bind.html>
  * - <https://man7.org/linux/man-pages/man2/bind.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-bind>
  * - <https://man.freebsd.org/cgi/man.cgi?query=bind&sektion=2&format=html>
  */
  bind(localAddress: IpSocketAddress): void;
  /**
  * Connect to a remote endpoint.
  * 
  * On success, the socket is transitioned into the `connected` state and this function returns a connection resource.
  * 
  * After a failed connection attempt, the socket will be in the `closed`
  * state and the only valid action left is to `drop` the socket. A single
  * socket can not be used to connect more than once.
  * 
  * # Typical errors
  * - `invalid-argument`:          The `remote-address` has the wrong address family. (EAFNOSUPPORT)
  * - `invalid-argument`:          `remote-address` is not a unicast address. (EINVAL, ENETUNREACH on Linux, EAFNOSUPPORT on MacOS)
  * - `invalid-argument`:          `remote-address` is an IPv4-mapped IPv6 address. (EINVAL, EADDRNOTAVAIL on Illumos)
  * - `invalid-argument`:          The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EADDRNOTAVAIL on Windows)
  * - `invalid-argument`:          The port in `remote-address` is set to 0. (EADDRNOTAVAIL on Windows)
  * - `invalid-state`:             The socket is already in the `connecting` state. (EALREADY)
  * - `invalid-state`:             The socket is already in the `connected` state. (EISCONN)
  * - `invalid-state`:             The socket is already in the `listening` state. (EOPNOTSUPP, EINVAL on Windows)
  * - `timeout`:                   Connection timed out. (ETIMEDOUT)
  * - `connection-refused`:        The connection was forcefully rejected. (ECONNREFUSED)
  * - `connection-reset`:          The connection was reset. (ECONNRESET)
  * - `connection-aborted`:        The connection was aborted. (ECONNABORTED)
  * - `remote-unreachable`:        The remote address is not reachable. (EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
  * - `address-in-use`:            Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/connect.html>
  * - <https://man7.org/linux/man-pages/man2/connect.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-connect>
  * - <https://man.freebsd.org/cgi/man.cgi?connect>
  */
  connect(remoteAddress: IpSocketAddress): Promise<void>;
  /**
  * Start listening and return a stream of new inbound connections.
  * 
  * Transitions the socket into the `listening` state. This can be called
  * at most once per socket.
  * 
  * If the socket is not already explicitly bound, this function will
  * implicitly bind the socket to a random free port.
  * 
  * Normally, the returned sockets are bound, in the `connected` state
  * and immediately ready for I/O. Though, depending on exact timing and
  * circumstances, a newly accepted connection may already be `closed`
  * by the time the server attempts to perform its first I/O on it. This
  * is true regardless of whether the WASI implementation uses
  * "synthesized" sockets or not (see Implementors Notes below).
  * 
  * The following properties are inherited from the listener socket:
  * - `address-family`
  * - `keep-alive-enabled`
  * - `keep-alive-idle-time`
  * - `keep-alive-interval`
  * - `keep-alive-count`
  * - `hop-limit`
  * - `receive-buffer-size`
  * - `send-buffer-size`
  * 
  * # Typical errors
  * - `invalid-state`:             The socket is already in the `connected` state. (EISCONN, EINVAL on BSD)
  * - `invalid-state`:             The socket is already in the `listening` state.
  * - `address-in-use`:            Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
  * 
  * # Implementors note
  * This method returns a single perpetual stream that should only close
  * on fatal errors (if any). Yet, the POSIX' `accept` function may also
  * return transient errors (e.g. ECONNABORTED). The exact details differ
  * per operation system. For example, the Linux manual mentions:
  * 
  * > Linux accept() passes already-pending network errors on the new
  * > socket as an error code from accept(). This behavior differs from
  * > other BSD socket implementations. For reliable operation the
  * > application should detect the network errors defined for the
  * > protocol after accept() and treat them like EAGAIN by retrying.
  * > In the case of TCP/IP, these are ENETDOWN, EPROTO, ENOPROTOOPT,
  * > EHOSTDOWN, ENONET, EHOSTUNREACH, EOPNOTSUPP, and ENETUNREACH.
  * Source: https://man7.org/linux/man-pages/man2/accept.2.html
  * 
  * WASI implementations have two options to handle this:
  * - Optionally log it and then skip over non-fatal errors returned by
  *   `accept`. Guest code never gets to see these failures. Or:
  * - Synthesize a `tcp-socket` resource that exposes the error when
  *   attempting to send or receive on it. Guest code then sees these
  *   failures as regular I/O errors.
  * 
  * In either case, the stream returned by this `listen` method remains
  * operational.
  * 
  * WASI requires `listen` to perform an implicit bind if the socket
  * has not already been bound. Not all platforms (notably Windows)
  * exhibit this behavior out of the box. On platforms that require it,
  * the WASI implementation can emulate this behavior by performing
  * the bind itself if the guest hasn't already done so.
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/listen.html>
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/accept.html>
  * - <https://man7.org/linux/man-pages/man2/listen.2.html>
  * - <https://man7.org/linux/man-pages/man2/accept.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-listen>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-accept>
  * - <https://man.freebsd.org/cgi/man.cgi?query=listen&sektion=2>
  * - <https://man.freebsd.org/cgi/man.cgi?query=accept&sektion=2>
  */
  listen(): ReadableStream<TcpSocket>;
  /**
  * Transmit data to peer.
  * 
  * The caller should close the stream when it has no more data to send
  * to the peer. Under normal circumstances this will cause a FIN packet
  * to be sent out. Closing the stream is equivalent to calling
  * `shutdown(SHUT_WR)` in POSIX.
  * 
  * This function may be called at most once and returns once the full
  * contents of the stream are transmitted or an error is encountered.
  * 
  * # Typical errors
  * - `invalid-state`:             The socket is not in the `connected` state. (ENOTCONN)
  * - `connection-reset`:          The connection was reset. (ECONNRESET)
  * - `remote-unreachable`:        The remote address is not reachable. (EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
  * 
  *  # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/send.html>
  * - <https://man7.org/linux/man-pages/man2/send.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-send>
  * - <https://man.freebsd.org/cgi/man.cgi?query=send&sektion=2>
  */
  send(data: ReadableStream<number>): Promise<Result<void, ErrorCode>>;
  /**
  * Read data from peer.
  * 
  * This function returns a `stream` which provides the data received from the
  * socket, and a `future` providing additional error information in case the
  * socket is closed abnormally.
  * 
  * If the socket is closed normally, `stream.read` on the `stream` will return
  * `read-status::closed` with no `error-context` and the future resolves to
  * the value `ok`. If the socket is closed abnormally, `stream.read` on the
  * `stream` returns `read-status::closed` with an `error-context` and the future
  * resolves to `err` with an `error-code`.
  * 
  * `receive` is meant to be called only once per socket. If it is called more
  * than once, the subsequent calls return a new `stream` that fails as if it
  * were closed abnormally.
  * 
  * If the caller is not expecting to receive any data from the peer,
  * they may drop the stream. Any data still in the receive queue
  * will be discarded. This is equivalent to calling `shutdown(SHUT_RD)`
  * in POSIX.
  * 
  * # Typical errors
  * - `invalid-state`:             The socket is not in the `connected` state. (ENOTCONN)
  * - `connection-reset`:          The connection was reset. (ECONNRESET)
  * - `remote-unreachable`:        The remote address is not reachable. (EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/recv.html>
  * - <https://man7.org/linux/man-pages/man2/recv.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-recv>
  * - <https://man.freebsd.org/cgi/man.cgi?query=recv&sektion=2>
  */
  receive(): [ReadableStream<number>, Promise<Result<void, ErrorCode>>];
  /**
  * Get the bound local address.
  * 
  * POSIX mentions:
  * > If the socket has not been bound to a local name, the value
  * > stored in the object pointed to by `address` is unspecified.
  * 
  * WASI is stricter and requires `get-local-address` to return `invalid-state` when the socket hasn't been bound yet.
  * 
  * # Typical errors
  * - `invalid-state`: The socket is not bound to any local address.
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/getsockname.html>
  * - <https://man7.org/linux/man-pages/man2/getsockname.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-getsockname>
  * - <https://man.freebsd.org/cgi/man.cgi?getsockname>
  */
  getLocalAddress(): IpSocketAddress;
  /**
  * Get the remote address.
  * 
  * # Typical errors
  * - `invalid-state`: The socket is not connected to a remote address. (ENOTCONN)
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/getpeername.html>
  * - <https://man7.org/linux/man-pages/man2/getpeername.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-getpeername>
  * - <https://man.freebsd.org/cgi/man.cgi?query=getpeername&sektion=2&n=1>
  */
  getRemoteAddress(): IpSocketAddress;
  /**
  * Whether the socket is in the `listening` state.
  * 
  * Equivalent to the SO_ACCEPTCONN socket option.
  */
  getIsListening(): boolean;
  /**
  * Whether this is a IPv4 or IPv6 socket.
  * 
  * This is the value passed to the constructor.
  * 
  * Equivalent to the SO_DOMAIN socket option.
  */
  getAddressFamily(): IpAddressFamily;
  /**
  * Hints the desired listen queue size. Implementations are free to ignore this.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * Any other value will never cause an error, but it might be silently clamped and/or rounded.
  * 
  * # Typical errors
  * - `not-supported`:        (set) The platform does not support changing the backlog size after the initial listen.
  * - `invalid-argument`:     (set) The provided value was 0.
  * - `invalid-state`:        (set) The socket is in the `connecting` or `connected` state.
  */
  setListenBacklogSize(value: bigint): void;
  /**
  * Enables or disables keepalive.
  * 
  * The keepalive behavior can be adjusted using:
  * - `keep-alive-idle-time`
  * - `keep-alive-interval`
  * - `keep-alive-count`
  * These properties can be configured while `keep-alive-enabled` is false, but only come into effect when `keep-alive-enabled` is true.
  * 
  * Equivalent to the SO_KEEPALIVE socket option.
  */
  getKeepAliveEnabled(): boolean;
  setKeepAliveEnabled(value: boolean): void;
  /**
  * Amount of time the connection has to be idle before TCP starts sending keepalive packets.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * Any other value will never cause an error, but it might be silently clamped and/or rounded.
  * I.e. after setting a value, reading the same setting back may return a different value.
  * 
  * Equivalent to the TCP_KEEPIDLE socket option. (TCP_KEEPALIVE on MacOS)
  * 
  * # Typical errors
  * - `invalid-argument`:     (set) The provided value was 0.
  */
  getKeepAliveIdleTime(): Duration;
  setKeepAliveIdleTime(value: Duration): void;
  /**
  * The time between keepalive packets.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * Any other value will never cause an error, but it might be silently clamped and/or rounded.
  * I.e. after setting a value, reading the same setting back may return a different value.
  * 
  * Equivalent to the TCP_KEEPINTVL socket option.
  * 
  * # Typical errors
  * - `invalid-argument`:     (set) The provided value was 0.
  */
  getKeepAliveInterval(): Duration;
  setKeepAliveInterval(value: Duration): void;
  /**
  * The maximum amount of keepalive packets TCP should send before aborting the connection.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * Any other value will never cause an error, but it might be silently clamped and/or rounded.
  * I.e. after setting a value, reading the same setting back may return a different value.
  * 
  * Equivalent to the TCP_KEEPCNT socket option.
  * 
  * # Typical errors
  * - `invalid-argument`:     (set) The provided value was 0.
  */
  getKeepAliveCount(): number;
  setKeepAliveCount(value: number): void;
  /**
  * Equivalent to the IP_TTL & IPV6_UNICAST_HOPS socket options.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * 
  * # Typical errors
  * - `invalid-argument`:     (set) The TTL value must be 1 or higher.
  */
  getHopLimit(): number;
  setHopLimit(value: number): void;
  /**
  * The kernel buffer space reserved for sends/receives on this socket.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * Any other value will never cause an error, but it might be silently clamped and/or rounded.
  * I.e. after setting a value, reading the same setting back may return a different value.
  * 
  * Equivalent to the SO_RCVBUF and SO_SNDBUF socket options.
  * 
  * # Typical errors
  * - `invalid-argument`:     (set) The provided value was 0.
  */
  getReceiveBufferSize(): bigint;
  setReceiveBufferSize(value: bigint): void;
  getSendBufferSize(): bigint;
  setSendBufferSize(value: bigint): void;
}

export class UdpSocket {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  /**
  * Create a new UDP socket.
  * 
  * Similar to `socket(AF_INET or AF_INET6, SOCK_DGRAM, IPPROTO_UDP)` in POSIX.
  * On IPv6 sockets, IPV6_V6ONLY is enabled by default and can't be configured otherwise.
  * 
  * Unlike POSIX, WASI sockets have no notion of a socket-level
  * `O_NONBLOCK` flag. Instead they fully rely on the Component Model's
  * async support.
  * 
  * # References:
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/socket.html>
  * - <https://man7.org/linux/man-pages/man2/socket.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-wsasocketw>
  * - <https://man.freebsd.org/cgi/man.cgi?query=socket&sektion=2>
  */
  static create(addressFamily: IpAddressFamily): UdpSocket;
  /**
  * Bind the socket to the provided IP address and port.
  * 
  * If the IP address is zero (`0.0.0.0` in IPv4, `::` in IPv6), it is left to the implementation to decide which
  * network interface(s) to bind to.
  * If the port is zero, the socket will be bound to a random free port.
  * 
  * # Typical errors
  * - `invalid-argument`:          The `local-address` has the wrong address family. (EAFNOSUPPORT, EFAULT on Windows)
  * - `invalid-state`:             The socket is already bound. (EINVAL)
  * - `address-in-use`:            No ephemeral ports available. (EADDRINUSE, ENOBUFS on Windows)
  * - `address-in-use`:            Address is already in use. (EADDRINUSE)
  * - `address-not-bindable`:      `local-address` is not an address that can be bound to. (EADDRNOTAVAIL)
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/bind.html>
  * - <https://man7.org/linux/man-pages/man2/bind.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-bind>
  * - <https://man.freebsd.org/cgi/man.cgi?query=bind&sektion=2&format=html>
  */
  bind(localAddress: IpSocketAddress): void;
  /**
  * Associate this socket with a specific peer address.
  * 
  * On success, the `remote-address` of the socket is updated.
  * The `local-address` may be updated as well, based on the best network
  * path to `remote-address`. If the socket was not already explicitly
  * bound, this function will implicitly bind the socket to a random
  * free port.
  * 
  * When a UDP socket is "connected", the `send` and `receive` methods
  * are limited to communicating with that peer only:
  * - `send` can only be used to send to this destination.
  * - `receive` will only return datagrams sent from the provided `remote-address`.
  * 
  * The name "connect" was kept to align with the existing POSIX
  * terminology. Other than that, this function only changes the local
  * socket configuration and does not generate any network traffic.
  * The peer is not aware of this "connection".
  * 
  * This method may be called multiple times on the same socket to change
  * its association, but only the most recent one will be effective.
  * 
  * # Typical errors
  * - `invalid-argument`:          The `remote-address` has the wrong address family. (EAFNOSUPPORT)
  * - `invalid-argument`:          The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EDESTADDRREQ, EADDRNOTAVAIL)
  * - `invalid-argument`:          The port in `remote-address` is set to 0. (EDESTADDRREQ, EADDRNOTAVAIL)
  * - `address-in-use`:            Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
  * 
  * # Implementors note
  * If the socket is already connected, some platforms (e.g. Linux)
  * require a disconnect before connecting to a different peer address.
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/connect.html>
  * - <https://man7.org/linux/man-pages/man2/connect.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-connect>
  * - <https://man.freebsd.org/cgi/man.cgi?connect>
  */
  connect(remoteAddress: IpSocketAddress): void;
  /**
  * Dissociate this socket from its peer address.
  * 
  * After calling this method, `send` & `receive` are free to communicate
  * with any address again.
  * 
  * The POSIX equivalent of this is calling `connect` with an `AF_UNSPEC` address.
  * 
  * # Typical errors
  * - `invalid-state`:           The socket is not connected.
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/connect.html>
  * - <https://man7.org/linux/man-pages/man2/connect.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-connect>
  * - <https://man.freebsd.org/cgi/man.cgi?connect>
  */
  disconnect(): void;
  /**
  * Send a message on the socket to a particular peer.
  * 
  * If the socket is connected, the peer address may be left empty. In
  * that case this is equivalent to `send` in POSIX. Otherwise it is
  * equivalent to `sendto`.
  * 
  * Additionally, if the socket is connected, a `remote-address` argument
  * _may_ be provided but then it must be identical to the address
  * passed to `connect`.
  * 
  * Implementations may trap if the `data` length exceeds 64 KiB.
  * 
  * # Typical errors
  * - `invalid-argument`:        The `remote-address` has the wrong address family. (EAFNOSUPPORT)
  * - `invalid-argument`:        The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EDESTADDRREQ, EADDRNOTAVAIL)
  * - `invalid-argument`:        The port in `remote-address` is set to 0. (EDESTADDRREQ, EADDRNOTAVAIL)
  * - `invalid-argument`:        The socket is in "connected" mode and `remote-address` is `some` value that does not match the address passed to `connect`. (EISCONN)
  * - `invalid-argument`:        The socket is not "connected" and no value for `remote-address` was provided. (EDESTADDRREQ)
  * - `remote-unreachable`:      The remote address is not reachable. (ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
  * - `connection-refused`:      The connection was refused. (ECONNREFUSED)
  * - `datagram-too-large`:      The datagram is too large. (EMSGSIZE)
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/sendto.html>
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/sendmsg.html>
  * - <https://man7.org/linux/man-pages/man2/send.2.html>
  * - <https://man7.org/linux/man-pages/man2/sendmmsg.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-send>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-sendto>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-wsasendmsg>
  * - <https://man.freebsd.org/cgi/man.cgi?query=send&sektion=2>
  */
  send(data: Uint8Array, remoteAddress: IpSocketAddress | undefined): Promise<void>;
  /**
  * Receive a message on the socket.
  * 
  * On success, the return value contains a tuple of the received data
  * and the address of the sender. Theoretical maximum length of the
  * data is 64 KiB. Though in practice, it will typically be less than
  * 1500 bytes.
  * 
  * If the socket is connected, the sender address is guaranteed to
  * match the remote address passed to `connect`.
  * 
  * # Typical errors
  * - `invalid-state`:        The socket has not been bound yet.
  * - `remote-unreachable`:   The remote address is not reachable. (ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
  * - `connection-refused`:   The connection was refused. (ECONNREFUSED)
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/recvfrom.html>
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/recvmsg.html>
  * - <https://man7.org/linux/man-pages/man2/recv.2.html>
  * - <https://man7.org/linux/man-pages/man2/recvmmsg.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-recvfrom>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/mswsock/nc-mswsock-lpfn_wsarecvmsg>
  * - <https://man.freebsd.org/cgi/man.cgi?query=recv&sektion=2>
  */
  receive(): Promise<[Uint8Array, IpSocketAddress]>;
  /**
  * Get the current bound address.
  * 
  * POSIX mentions:
  * > If the socket has not been bound to a local name, the value
  * > stored in the object pointed to by `address` is unspecified.
  * 
  * WASI is stricter and requires `get-local-address` to return `invalid-state` when the socket hasn't been bound yet.
  * 
  * # Typical errors
  * - `invalid-state`: The socket is not bound to any local address.
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/getsockname.html>
  * - <https://man7.org/linux/man-pages/man2/getsockname.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-getsockname>
  * - <https://man.freebsd.org/cgi/man.cgi?getsockname>
  */
  getLocalAddress(): IpSocketAddress;
  /**
  * Get the address the socket is currently "connected" to.
  * 
  * # Typical errors
  * - `invalid-state`: The socket is not "connected" to a specific remote address. (ENOTCONN)
  * 
  * # References
  * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/getpeername.html>
  * - <https://man7.org/linux/man-pages/man2/getpeername.2.html>
  * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-getpeername>
  * - <https://man.freebsd.org/cgi/man.cgi?query=getpeername&sektion=2&n=1>
  */
  getRemoteAddress(): IpSocketAddress;
  /**
  * Whether this is a IPv4 or IPv6 socket.
  * 
  * This is the value passed to the constructor.
  * 
  * Equivalent to the SO_DOMAIN socket option.
  */
  getAddressFamily(): IpAddressFamily;
  /**
  * Equivalent to the IP_TTL & IPV6_UNICAST_HOPS socket options.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * 
  * # Typical errors
  * - `invalid-argument`:     (set) The TTL value must be 1 or higher.
  */
  getUnicastHopLimit(): number;
  setUnicastHopLimit(value: number): void;
  /**
  * The kernel buffer space reserved for sends/receives on this socket.
  * 
  * If the provided value is 0, an `invalid-argument` error is returned.
  * Any other value will never cause an error, but it might be silently clamped and/or rounded.
  * I.e. after setting a value, reading the same setting back may return a different value.
  * 
  * Equivalent to the SO_RCVBUF and SO_SNDBUF socket options.
  * 
  * # Typical errors
  * - `invalid-argument`:     (set) The provided value was 0.
  */
  getReceiveBufferSize(): bigint;
  setReceiveBufferSize(value: bigint): void;
  getSendBufferSize(): bigint;
  setSendBufferSize(value: bigint): void;
}

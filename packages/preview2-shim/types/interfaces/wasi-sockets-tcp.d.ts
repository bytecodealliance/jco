export namespace WasiSocketsTcp {
  /**
   * Bind the socket to a specific network on the provided IP address and port.
   * 
   * If the IP address is zero (`0.0.0.0` in IPv4, `::` in IPv6), it is left to the implementation to decide which
   * network interface(s) to bind to.
   * If the TCP/UDP port is zero, the socket will be bound to a random free port.
   * 
   * When a socket is not explicitly bound, the first invocation to a listen or connect operation will
   * implicitly bind the socket.
   * 
   * Unlike in POSIX, this function is async. This enables interactive WASI hosts to inject permission prompts.
   * 
   * # Typical `start` errors
   * - `invalid-argument`:          The `local-address` has the wrong address family. (EAFNOSUPPORT, EFAULT on Windows)
   * - `invalid-argument`:          `local-address` is not a unicast address. (EINVAL)
   * - `invalid-argument`:          `local-address` is an IPv4-mapped IPv6 address, but the socket has `ipv6-only` enabled. (EINVAL)
   * - `invalid-state`:             The socket is already bound. (EINVAL)
   * 
   * # Typical `finish` errors
   * - `address-in-use`:            No ephemeral ports available. (EADDRINUSE, ENOBUFS on Windows)
   * - `address-in-use`:            Address is already in use. (EADDRINUSE)
   * - `address-not-bindable`:      `local-address` is not an address that the `network` can bind to. (EADDRNOTAVAIL)
   * - `not-in-progress`:           A `bind` operation is not in progress.
   * - `would-block`:               Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   * 
   * # Implementors note
   * When binding to a non-zero port, this bind operation shouldn't be affected by the TIME_WAIT
   * state of a recently closed socket on the same local address (i.e. the SO_REUSEADDR socket
   * option should be set implicitly on platforms that require it).
   * 
   * # References
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/bind.html>
   * - <https://man7.org/linux/man-pages/man2/bind.2.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-bind>
   * - <https://man.freebsd.org/cgi/man.cgi?query=bind&sektion=2&format=html>
   */
  export { TcpSocket };
  /**
   * Connect to a remote endpoint.
   * 
   * On success:
   * - the socket is transitioned into the Connection state
   * - a pair of streams is returned that can be used to read & write to the connection
   * 
   * POSIX mentions:
   * > If connect() fails, the state of the socket is unspecified. Conforming applications should
   * > close the file descriptor and create a new socket before attempting to reconnect.
   * 
   * WASI prescribes the following behavior:
   * - If `connect` fails because an input/state validation error, the socket should remain usable.
   * - If a connection was actually attempted but failed, the socket should become unusable for further network communication.
   * Besides `drop`, any method after such a failure may return an error.
   * 
   * # Typical `start` errors
   * - `invalid-argument`:          The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * - `invalid-argument`:          `remote-address` is not a unicast address. (EINVAL, ENETUNREACH on Linux, EAFNOSUPPORT on MacOS)
   * - `invalid-argument`:          `remote-address` is an IPv4-mapped IPv6 address, but the socket has `ipv6-only` enabled. (EINVAL, EADDRNOTAVAIL on Illumos)
   * - `invalid-argument`:          `remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * - `invalid-argument`:          The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EADDRNOTAVAIL on Windows)
   * - `invalid-argument`:          The port in `remote-address` is set to 0. (EADDRNOTAVAIL on Windows)
   * - `invalid-argument`:          The socket is already attached to a different network. The `network` passed to `connect` must be identical to the one passed to `bind`.
   * - `invalid-state`:             The socket is already in the Connection state. (EISCONN)
   * - `invalid-state`:             The socket is already in the Listener state. (EOPNOTSUPP, EINVAL on Windows)
   * 
   * # Typical `finish` errors
   * - `timeout`:                   Connection timed out. (ETIMEDOUT)
   * - `connection-refused`:        The connection was forcefully rejected. (ECONNREFUSED)
   * - `connection-reset`:          The connection was reset. (ECONNRESET)
   * - `connection-aborted`:        The connection was aborted. (ECONNABORTED)
   * - `remote-unreachable`:        The remote address is not reachable. (EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN, ENONET)
   * - `address-in-use`:            Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE, EADDRNOTAVAIL on Linux, EAGAIN on BSD)
   * - `not-in-progress`:           A `connect` operation is not in progress.
   * - `would-block`:               Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   * 
   * # References
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/connect.html>
   * - <https://man7.org/linux/man-pages/man2/connect.2.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-connect>
   * - <https://man.freebsd.org/cgi/man.cgi?connect>
   */
  /**
   * Start listening for new connections.
   * 
   * Transitions the socket into the Listener state.
   * 
   * Unlike POSIX:
   * - this function is async. This enables interactive WASI hosts to inject permission prompts.
   * - the socket must already be explicitly bound.
   * 
   * # Typical `start` errors
   * - `invalid-state`:             The socket is not bound to any local address. (EDESTADDRREQ)
   * - `invalid-state`:             The socket is already in the Connection state. (EISCONN, EINVAL on BSD)
   * - `invalid-state`:             The socket is already in the Listener state.
   * 
   * # Typical `finish` errors
   * - `address-in-use`:            Tried to perform an implicit bind, but there were no ephemeral ports available. (EADDRINUSE)
   * - `not-in-progress`:           A `listen` operation is not in progress.
   * - `would-block`:               Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   * 
   * # References
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/listen.html>
   * - <https://man7.org/linux/man-pages/man2/listen.2.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-listen>
   * - <https://man.freebsd.org/cgi/man.cgi?query=listen&sektion=2>
   */
  /**
   * Accept a new client socket.
   * 
   * The returned socket is bound and in the Connection state. The following properties are inherited from the listener socket:
   * - `address-family`
   * - `ipv6-only`
   * - `keep-alive-enabled`
   * - `keep-alive-idle-time`
   * - `keep-alive-interval`
   * - `keep-alive-count`
   * - `hop-limit`
   * - `receive-buffer-size`
   * - `send-buffer-size`
   * 
   * On success, this function returns the newly accepted client socket along with
   * a pair of streams that can be used to read & write to the connection.
   * 
   * # Typical errors
   * - `invalid-state`:      Socket is not in the Listener state. (EINVAL)
   * - `would-block`:        No pending connections at the moment. (EWOULDBLOCK, EAGAIN)
   * - `connection-aborted`: An incoming connection was pending, but was terminated by the client before this listener could accept it. (ECONNABORTED)
   * - `new-socket-limit`:   The new socket resource could not be created because of a system limit. (EMFILE, ENFILE)
   * 
   * # References
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/accept.html>
   * - <https://man7.org/linux/man-pages/man2/accept.2.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-accept>
   * - <https://man.freebsd.org/cgi/man.cgi?query=accept&sektion=2>
   */
  /**
   * Get the bound local address.
   * 
   * POSIX mentions:
   * > If the socket has not been bound to a local name, the value
   * > stored in the object pointed to by `address` is unspecified.
   * 
   * WASI is stricter and requires `local-address` to return `invalid-state` when the socket hasn't been bound yet.
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
  /**
   * Whether the socket is listening for new connections.
   * 
   * Equivalent to the SO_ACCEPTCONN socket option.
   */
  /**
   * Whether this is a IPv4 or IPv6 socket.
   * 
   * Equivalent to the SO_DOMAIN socket option.
   */
  /**
   * Whether IPv4 compatibility (dual-stack) mode is disabled or not.
   * 
   * Equivalent to the IPV6_V6ONLY socket option.
   * 
   * # Typical errors
   * - `invalid-state`:        (set) The socket is already bound.
   * - `not-supported`:        (get/set) `this` socket is an IPv4 socket.
   * - `not-supported`:        (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   */
  /**
   * Hints the desired listen queue size. Implementations are free to ignore this.
   * 
   * If the provided value is 0, an `invalid-argument` error is returned.
   * Any other value will never cause an error, but it might be silently clamped and/or rounded.
   * 
   * # Typical errors
   * - `not-supported`:        (set) The platform does not support changing the backlog size after the initial listen.
   * - `invalid-argument`:     (set) The provided value was 0.
   * - `invalid-state`:        (set) The socket is already in the Connection state.
   */
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
  /**
   * Equivalent to the IP_TTL & IPV6_UNICAST_HOPS socket options.
   * 
   * If the provided value is 0, an `invalid-argument` error is returned.
   * 
   * # Typical errors
   * - `invalid-argument`:     (set) The TTL value must be 1 or higher.
   * - `invalid-state`:        (set) The socket is already in the Connection state.
   * - `invalid-state`:        (set) The socket is already in the Listener state.
   */
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
   * - `invalid-state`:        (set) The socket is already in the Connection state.
   * - `invalid-state`:        (set) The socket is already in the Listener state.
   */
  /**
   * Create a `pollable` which will resolve once the socket is ready for I/O.
   * 
   * Note: this function is here for WASI Preview2 only.
   * It's planned to be removed when `future` is natively supported in Preview3.
   */
  /**
   * Initiate a graceful shutdown.
   * 
   * - receive: the socket is not expecting to receive any more data from the peer. All subsequent read
   * operations on the `input-stream` associated with this socket will return an End Of Stream indication.
   * Any data still in the receive queue at time of calling `shutdown` will be discarded.
   * - send: the socket is not expecting to send any more data to the peer. All subsequent write
   * operations on the `output-stream` associated with this socket will return an error.
   * - both: same effect as receive & send combined.
   * 
   * The shutdown function does not close (drop) the socket.
   * 
   * # Typical errors
   * - `invalid-state`: The socket is not in the Connection state. (ENOTCONN)
   * 
   * # References
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/shutdown.html>
   * - <https://man7.org/linux/man-pages/man2/shutdown.2.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-shutdown>
   * - <https://man.freebsd.org/cgi/man.cgi?query=shutdown&sektion=2>
   */
}
import type { InputStream } from '../interfaces/wasi-io-streams.js';
export { InputStream };
import type { OutputStream } from '../interfaces/wasi-io-streams.js';
export { OutputStream };
import type { Pollable } from '../interfaces/wasi-io-poll.js';
export { Pollable };
import type { Duration } from '../interfaces/wasi-clocks-monotonic-clock.js';
export { Duration };
import type { Network } from '../interfaces/wasi-sockets-network.js';
export { Network };
import type { ErrorCode } from '../interfaces/wasi-sockets-network.js';
export { ErrorCode };
import type { IpSocketAddress } from '../interfaces/wasi-sockets-network.js';
export { IpSocketAddress };
import type { IpAddressFamily } from '../interfaces/wasi-sockets-network.js';
export { IpAddressFamily };
/**
 * # Variants
 * 
 * ## `"receive"`
 * 
 * Similar to `SHUT_RD` in POSIX.
 * ## `"send"`
 * 
 * Similar to `SHUT_WR` in POSIX.
 * ## `"both"`
 * 
 * Similar to `SHUT_RDWR` in POSIX.
 */
export type ShutdownType = 'receive' | 'send' | 'both';

export class TcpSocket {
  startBind(network: Network, localAddress: IpSocketAddress): void;
  finishBind(): void;
  startConnect(network: Network, remoteAddress: IpSocketAddress): void;
  finishConnect(): [InputStream, OutputStream];
  startListen(): void;
  finishListen(): void;
  accept(): [TcpSocket, InputStream, OutputStream];
  localAddress(): IpSocketAddress;
  remoteAddress(): IpSocketAddress;
  isListening(): boolean;
  addressFamily(): IpAddressFamily;
  ipv6Only(): boolean;
  setIpv6Only(value: boolean): void;
  setListenBacklogSize(value: bigint): void;
  keepAliveEnabled(): boolean;
  setKeepAliveEnabled(value: boolean): void;
  keepAliveIdleTime(): Duration;
  setKeepAliveIdleTime(value: Duration): void;
  keepAliveInterval(): Duration;
  setKeepAliveInterval(value: Duration): void;
  keepAliveCount(): number;
  setKeepAliveCount(value: number): void;
  hopLimit(): number;
  setHopLimit(value: number): void;
  receiveBufferSize(): bigint;
  setReceiveBufferSize(value: bigint): void;
  sendBufferSize(): bigint;
  setSendBufferSize(value: bigint): void;
  subscribe(): Pollable;
  shutdown(shutdownType: ShutdownType): void;
}

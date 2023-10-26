export namespace WasiSocketsUdp {
  /**
   * Bind the socket to a specific network on the provided IP address and port.
   * 
   * If the IP address is zero (`0.0.0.0` in IPv4, `::` in IPv6), it is left to the implementation to decide which
   * network interface(s) to bind to.
   * If the TCP/UDP port is zero, the socket will be bound to a random free port.
   * 
   * When a socket is not explicitly bound, the first invocation to connect will implicitly bind the socket.
   * 
   * Unlike in POSIX, this function is async. This enables interactive WASI hosts to inject permission prompts.
   * 
   * # Typical `start` errors
   * - `invalid-argument`:          The `local-address` has the wrong address family. (EAFNOSUPPORT, EFAULT on Windows)
   * - `invalid-state`:             The socket is already bound. (EINVAL)
   * 
   * # Typical `finish` errors
   * - `address-in-use`:            No ephemeral ports available. (EADDRINUSE, ENOBUFS on Windows)
   * - `address-in-use`:            Address is already in use. (EADDRINUSE)
   * - `address-not-bindable`:      `local-address` is not an address that the `network` can bind to. (EADDRNOTAVAIL)
   * - `not-in-progress`:           A `bind` operation is not in progress.
   * - `would-block`:               Can't finish the operation, it is still in progress. (EWOULDBLOCK, EAGAIN)
   * 
   * # References
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/bind.html>
   * - <https://man7.org/linux/man-pages/man2/bind.2.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-bind>
   * - <https://man.freebsd.org/cgi/man.cgi?query=bind&sektion=2&format=html>
   */
  export { UdpSocket };
  /**
   * Set the destination address.
   * 
   * The local-address is updated based on the best network path to `remote-address`.
   * 
   * When a destination address is set:
   * - all receive operations will only return datagrams sent from the provided `remote-address`.
   * - the `send` function can only be used to send to this destination.
   * 
   * Note that this function does not generate any network traffic and the peer is not aware of this "connection".
   * 
   * Unlike in POSIX, this function is async. This enables interactive WASI hosts to inject permission prompts.
   * 
   * # Typical `start` errors
   * - `invalid-argument`:          The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * - `invalid-argument`:          `remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * - `invalid-argument`:          The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EDESTADDRREQ, EADDRNOTAVAIL)
   * - `invalid-argument`:          The port in `remote-address` is set to 0. (EDESTADDRREQ, EADDRNOTAVAIL)
   * - `invalid-argument`:          The socket is already bound to a different network. The `network` passed to `connect` must be identical to the one passed to `bind`.
   * 
   * # Typical `finish` errors
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
   * Receive messages on the socket.
   * 
   * This function attempts to receive up to `max-results` datagrams on the socket without blocking.
   * The returned list may contain fewer elements than requested, but never more.
   * If `max-results` is 0, this function returns successfully with an empty list.
   * 
   * # Typical errors
   * - `invalid-state`:      The socket is not bound to any local address. (EINVAL)
   * - `remote-unreachable`: The remote address is not reachable. (ECONNREFUSED, ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * - `would-block`:        There is no pending data available to be read at the moment. (EWOULDBLOCK, EAGAIN)
   * 
   * # References
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/recvfrom.html>
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/recvmsg.html>
   * - <https://man7.org/linux/man-pages/man2/recv.2.html>
   * - <https://man7.org/linux/man-pages/man2/recvmmsg.2.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-recv>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-recvfrom>
   * - <https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/ms741687(v=vs.85)>
   * - <https://man.freebsd.org/cgi/man.cgi?query=recv&sektion=2>
   */
  /**
   * Send messages on the socket.
   * 
   * This function attempts to send all provided `datagrams` on the socket without blocking and
   * returns how many messages were actually sent (or queued for sending).
   * 
   * This function semantically behaves the same as iterating the `datagrams` list and sequentially
   * sending each individual datagram until either the end of the list has been reached or the first error occurred.
   * If at least one datagram has been sent successfully, this function never returns an error.
   * 
   * If the input list is empty, the function returns `ok(0)`.
   * 
   * The remote address option is required. To send a message to the "connected" peer,
   * call `remote-address` to get their address.
   * 
   * # Typical errors
   * - `invalid-argument`:        The `remote-address` has the wrong address family. (EAFNOSUPPORT)
   * - `invalid-argument`:        `remote-address` is a non-IPv4-mapped IPv6 address, but the socket was bound to a specific IPv4-mapped IPv6 address. (or vice versa)
   * - `invalid-argument`:        The IP address in `remote-address` is set to INADDR_ANY (`0.0.0.0` / `::`). (EDESTADDRREQ, EADDRNOTAVAIL)
   * - `invalid-argument`:        The port in `remote-address` is set to 0. (EDESTADDRREQ, EADDRNOTAVAIL)
   * - `invalid-argument`:        The socket is in "connected" mode and the `datagram.remote-address` does not match the address passed to `connect`. (EISCONN)
   * - `invalid-state`:           The socket is not bound to any local address. Unlike POSIX, this function does not perform an implicit bind.
   * - `remote-unreachable`:      The remote address is not reachable. (ECONNREFUSED, ECONNRESET, ENETRESET on Windows, EHOSTUNREACH, EHOSTDOWN, ENETUNREACH, ENETDOWN)
   * - `datagram-too-large`:      The datagram is too large. (EMSGSIZE)
   * - `would-block`:             The send buffer is currently full. (EWOULDBLOCK, EAGAIN)
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
  /**
   * Get the current bound address.
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
   * Get the address set with `connect`.
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
   * - `not-supported`:        (get/set) `this` socket is an IPv4 socket.
   * - `invalid-state`:        (set) The socket is already bound.
   * - `not-supported`:        (set) Host does not support dual-stack sockets. (Implementations are not required to.)
   */
  /**
   * Equivalent to the IP_TTL & IPV6_UNICAST_HOPS socket options.
   */
  /**
   * The kernel buffer space reserved for sends/receives on this socket.
   * 
   * Note #1: an implementation may choose to cap or round the buffer size when setting the value.
   * In other words, after setting a value, reading the same setting back may return a different value.
   * 
   * Note #2: there is not necessarily a direct relationship between the kernel buffer size and the bytes of
   * actual data to be sent/received by the application, because the kernel might also use the buffer space
   * for internal metadata structures.
   * 
   * Equivalent to the SO_RCVBUF and SO_SNDBUF socket options.
   */
  /**
   * Create a `pollable` which will resolve once the socket is ready for I/O.
   * 
   * Note: this function is here for WASI Preview2 only.
   * It's planned to be removed when `future` is natively supported in Preview3.
   */
}
import type { Pollable } from '../interfaces/wasi-io-poll.js';
export { Pollable };
import type { Network } from '../interfaces/wasi-sockets-network.js';
export { Network };
import type { ErrorCode } from '../interfaces/wasi-sockets-network.js';
export { ErrorCode };
import type { IpSocketAddress } from '../interfaces/wasi-sockets-network.js';
export { IpSocketAddress };
import type { IpAddressFamily } from '../interfaces/wasi-sockets-network.js';
export { IpAddressFamily };
export interface Datagram {
  data: Uint8Array,
  remoteAddress: IpSocketAddress,
}

export class UdpSocket {
  startBind(network: Network, localAddress: IpSocketAddress): void;
  finishBind(): void;
  startConnect(network: Network, remoteAddress: IpSocketAddress): void;
  finishConnect(): void;
  receive(maxResults: bigint): Datagram[];
  send(datagrams: Datagram[]): bigint;
  localAddress(): IpSocketAddress;
  remoteAddress(): IpSocketAddress;
  addressFamily(): IpAddressFamily;
  ipv6Only(): boolean;
  setIpv6Only(value: boolean): void;
  unicastHopLimit(): number;
  setUnicastHopLimit(value: number): void;
  receiveBufferSize(): bigint;
  setReceiveBufferSize(value: bigint): void;
  sendBufferSize(): bigint;
  setSendBufferSize(value: bigint): void;
  subscribe(): Pollable;
}

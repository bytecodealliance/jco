export namespace WasiSocketsNetwork {
  export { Network };
}
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
 * - `concurrency-conflict`
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
 * ## `"concurrency-conflict"`
 * 
 * This operation is incompatible with another asynchronous operation that is already in progress.
 * 
 * POSIX equivalent: EALREADY
 * ## `"not-in-progress"`
 * 
 * Trying to finish an asynchronous operation that:
 * - has not been started yet, or:
 * - was already finished by a previous `finish-*` call.
 * 
 * Note: this is scheduled to be removed when `future`s are natively supported.
 * ## `"would-block"`
 * 
 * The operation has been aborted because it could not be completed immediately.
 * 
 * Note: this is scheduled to be removed when `future`s are natively supported.
 * ## `"invalid-state"`
 * 
 * The operation is not valid in the socket's current state.
 * ## `"new-socket-limit"`
 * 
 * A new socket resource could not be created because of a system limit.
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
 * ## `"name-unresolvable"`
 * 
 * Name does not exist or has no suitable associated IP addresses.
 * ## `"temporary-resolver-failure"`
 * 
 * A temporary failure in name resolution occurred.
 * ## `"permanent-resolver-failure"`
 * 
 * A permanent failure in name resolution occurred.
 */
export type ErrorCode = 'unknown' | 'access-denied' | 'not-supported' | 'invalid-argument' | 'out-of-memory' | 'timeout' | 'concurrency-conflict' | 'not-in-progress' | 'would-block' | 'invalid-state' | 'new-socket-limit' | 'address-not-bindable' | 'address-in-use' | 'remote-unreachable' | 'connection-refused' | 'connection-reset' | 'connection-aborted' | 'datagram-too-large' | 'name-unresolvable' | 'temporary-resolver-failure' | 'permanent-resolver-failure';
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

export class Network {
}

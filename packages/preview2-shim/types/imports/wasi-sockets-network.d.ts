export namespace WasiSocketsNetwork {
  /**
   * Dispose of the specified `network`, after which it may no longer be used.
   * 
   * Note: this function is scheduled to be removed when Resources are natively supported in Wit.
   */
  export function dropNetwork(this: Network): void;
}
/**
 * An opaque resource that represents access to (a subset of) the network.
 * This enables context-based security for networking.
 * There is no need for this to map 1:1 to a physical network interface.
 * 
 * FYI, In the future this will be replaced by handle types.
 */
export type Network = number;
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
 * 
 * # Variants
 * 
 * ## `"unknown"`
 * 
 * Unknown error
 * 
 * ## `"access-denied"`
 * 
 * Access denied.
 * 
 * POSIX equivalent: EACCES, EPERM
 * 
 * ## `"not-supported"`
 * 
 * The operation is not supported.
 * 
 * POSIX equivalent: EOPNOTSUPP
 * 
 * ## `"out-of-memory"`
 * 
 * Not enough memory to complete the operation.
 * 
 * POSIX equivalent: ENOMEM, ENOBUFS, EAI_MEMORY
 * 
 * ## `"timeout"`
 * 
 * The operation timed out before it could finish completely.
 * 
 * ## `"concurrency-conflict"`
 * 
 * This operation is incompatible with another asynchronous operation that is already in progress.
 * 
 * ## `"not-in-progress"`
 * 
 * Trying to finish an asynchronous operation that:
 * - has not been started yet, or:
 * - was already finished by a previous `finish-*` call.
 * 
 * Note: this is scheduled to be removed when `future`s are natively supported.
 * 
 * ## `"would-block"`
 * 
 * The operation has been aborted because it could not be completed immediately.
 * 
 * Note: this is scheduled to be removed when `future`s are natively supported.
 * 
 * ## `"address-family-not-supported"`
 * 
 * The specified address-family is not supported.
 * 
 * ## `"address-family-mismatch"`
 * 
 * An IPv4 address was passed to an IPv6 resource, or vice versa.
 * 
 * ## `"invalid-remote-address"`
 * 
 * The socket address is not a valid remote address. E.g. the IP address is set to INADDR_ANY, or the port is set to 0.
 * 
 * ## `"ipv4-only-operation"`
 * 
 * The operation is only supported on IPv4 resources.
 * 
 * ## `"ipv6-only-operation"`
 * 
 * The operation is only supported on IPv6 resources.
 * 
 * ## `"new-socket-limit"`
 * 
 * A new socket resource could not be created because of a system limit.
 * 
 * ## `"already-attached"`
 * 
 * The socket is already attached to another network.
 * 
 * ## `"already-bound"`
 * 
 * The socket is already bound.
 * 
 * ## `"already-connected"`
 * 
 * The socket is already in the Connection state.
 * 
 * ## `"not-bound"`
 * 
 * The socket is not bound to any local address.
 * 
 * ## `"not-connected"`
 * 
 * The socket is not in the Connection state.
 * 
 * ## `"address-not-bindable"`
 * 
 * A bind operation failed because the provided address is not an address that the `network` can bind to.
 * 
 * ## `"address-in-use"`
 * 
 * A bind operation failed because the provided address is already in use.
 * 
 * ## `"ephemeral-ports-exhausted"`
 * 
 * A bind operation failed because there are no ephemeral ports available.
 * 
 * ## `"remote-unreachable"`
 * 
 * The remote address is not reachable
 * 
 * ## `"already-listening"`
 * 
 * The socket is already in the Listener state.
 * 
 * ## `"not-listening"`
 * 
 * The socket is already in the Listener state.
 * 
 * ## `"connection-refused"`
 * 
 * The connection was forcefully rejected
 * 
 * ## `"connection-reset"`
 * 
 * The connection was reset.
 * 
 * ## `"datagram-too-large"`
 * 
 * ## `"invalid-name"`
 * 
 * The provided name is a syntactically invalid domain name.
 * 
 * ## `"name-unresolvable"`
 * 
 * Name does not exist or has no suitable associated IP addresses.
 * 
 * ## `"temporary-resolver-failure"`
 * 
 * A temporary failure in name resolution occurred.
 * 
 * ## `"permanent-resolver-failure"`
 * 
 * A permanent failure in name resolution occurred.
 */
export type ErrorCode = 'unknown' | 'access-denied' | 'not-supported' | 'out-of-memory' | 'timeout' | 'concurrency-conflict' | 'not-in-progress' | 'would-block' | 'address-family-not-supported' | 'address-family-mismatch' | 'invalid-remote-address' | 'ipv4-only-operation' | 'ipv6-only-operation' | 'new-socket-limit' | 'already-attached' | 'already-bound' | 'already-connected' | 'not-bound' | 'not-connected' | 'address-not-bindable' | 'address-in-use' | 'ephemeral-ports-exhausted' | 'remote-unreachable' | 'already-listening' | 'not-listening' | 'connection-refused' | 'connection-reset' | 'datagram-too-large' | 'invalid-name' | 'name-unresolvable' | 'temporary-resolver-failure' | 'permanent-resolver-failure';
/**
 * # Variants
 * 
 * ## `"ipv4"`
 * 
 * Similar to `AF_INET` in POSIX.
 * 
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
  port: number,
  address: Ipv4Address,
}
export interface Ipv6SocketAddress {
  port: number,
  flowInfo: number,
  address: Ipv6Address,
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

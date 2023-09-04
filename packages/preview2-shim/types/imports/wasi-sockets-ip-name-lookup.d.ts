export namespace WasiSocketsIpNameLookup {
  /**
   * Resolve an internet host name to a list of IP addresses.
   * 
   * See the wasi-socket proposal README.md for a comparison with getaddrinfo.
   * 
   * # Parameters
   * - `name`: The name to look up. IP addresses are not allowed. Unicode domain names are automatically converted
   * to ASCII using IDNA encoding.
   * - `address-family`: If provided, limit the results to addresses of this specific address family.
   * - `include-unavailable`: When set to true, this function will also return addresses of which the runtime
   * thinks (or knows) can't be connected to at the moment. For example, this will return IPv6 addresses on
   * systems without an active IPv6 interface. Notes:
   * - Even when no public IPv6 interfaces are present or active, names like "localhost" can still resolve to an IPv6 address.
   * - Whatever is "available" or "unavailable" is volatile and can change everytime a network cable is unplugged.
   * 
   * This function never blocks. It either immediately fails or immediately returns successfully with a `resolve-address-stream`
   * that can be used to (asynchronously) fetch the results.
   * 
   * At the moment, the stream never completes successfully with 0 items. Ie. the first call
   * to `resolve-next-address` never returns `ok(none)`. This may change in the future.
   * 
   * # Typical errors
   * - `invalid-name`:                 `name` is a syntactically invalid domain name.
   * - `invalid-name`:                 `name` is an IP address.
   * - `address-family-not-supported`: The specified `address-family` is not supported. (EAI_FAMILY)
   * 
   * # References:
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/getaddrinfo.html>
   * - <https://man7.org/linux/man-pages/man3/getaddrinfo.3.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/ws2tcpip/nf-ws2tcpip-getaddrinfo>
   * - <https://man.freebsd.org/cgi/man.cgi?query=getaddrinfo&sektion=3>
   */
  export function resolveAddresses(network: Network, name: string, addressFamily: IpAddressFamily | null, includeUnavailable: boolean): ResolveAddressStream;
  /**
   * Returns the next address from the resolver.
   * 
   * This function should be called multiple times. On each call, it will
   * return the next address in connection order preference. If all
   * addresses have been exhausted, this function returns `none`.
   * After which, you should release the stream with `drop-resolve-address-stream`.
   * 
   * This function never returns IPv4-mapped IPv6 addresses.
   * 
   * # Typical errors
   * - `name-unresolvable`:          Name does not exist or has no suitable associated IP addresses. (EAI_NONAME, EAI_NODATA, EAI_ADDRFAMILY)
   * - `temporary-resolver-failure`: A temporary failure in name resolution occurred. (EAI_AGAIN)
   * - `permanent-resolver-failure`: A permanent failure in name resolution occurred. (EAI_FAIL)
   * - `would-block`:                A result is not available yet. (EWOULDBLOCK, EAGAIN)
   */
  export function resolveNextAddress(this_: ResolveAddressStream): IpAddress | null;
  /**
   * Dispose of the specified `resolve-address-stream`, after which it may no longer be used.
   * 
   * Note: this function is scheduled to be removed when Resources are natively supported in Wit.
   */
  export function dropResolveAddressStream(this_: ResolveAddressStream): void;
  /**
   * Create a `pollable` which will resolve once the stream is ready for I/O.
   * 
   * Note: this function is here for WASI Preview2 only.
   * It's planned to be removed when `future` is natively supported in Preview3.
   */
  export function subscribe(this_: ResolveAddressStream): Pollable;
}
import type { Pollable } from '../imports/wasi-poll-poll';
export { Pollable };
import type { Network } from '../imports/wasi-sockets-network';
export { Network };
import type { ErrorCode } from '../imports/wasi-sockets-network';
export { ErrorCode };
import type { IpAddress } from '../imports/wasi-sockets-network';
export { IpAddress };
import type { IpAddressFamily } from '../imports/wasi-sockets-network';
export { IpAddressFamily };
export type ResolveAddressStream = number;

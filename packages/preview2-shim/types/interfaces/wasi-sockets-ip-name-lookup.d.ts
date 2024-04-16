export namespace WasiSocketsIpNameLookup {
  /**
   * Resolve an internet host name to a list of IP addresses.
   * 
   * Unicode domain names are automatically converted to ASCII using IDNA encoding.
   * If the input is an IP address string, the address is parsed and returned
   * as-is without making any external requests.
   * 
   * See the wasi-socket proposal README.md for a comparison with getaddrinfo.
   * 
   * This function never blocks. It either immediately fails or immediately
   * returns successfully with a `resolve-address-stream` that can be used
   * to (asynchronously) fetch the results.
   * 
   * # Typical errors
   * - `invalid-argument`: `name` is a syntactically invalid domain name or IP address.
   * 
   * # References:
   * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/getaddrinfo.html>
   * - <https://man7.org/linux/man-pages/man3/getaddrinfo.3.html>
   * - <https://learn.microsoft.com/en-us/windows/win32/api/ws2tcpip/nf-ws2tcpip-getaddrinfo>
   * - <https://man.freebsd.org/cgi/man.cgi?query=getaddrinfo&sektion=3>
   */
  export function resolveAddresses(network: Network, name: string): ResolveAddressStream;
  export { ResolveAddressStream };
}
import type { Pollable } from './wasi-io-poll.js';
export { Pollable };
import type { Network } from './wasi-sockets-network.js';
export { Network };
import type { ErrorCode } from './wasi-sockets-network.js';
export { ErrorCode };
import type { IpAddress } from './wasi-sockets-network.js';
export { IpAddress };

export class ResolveAddressStream {
  /**
  * Returns the next address from the resolver.
  * 
  * This function should be called multiple times. On each call, it will
  * return the next address in connection order preference. If all
  * addresses have been exhausted, this function returns `none`.
  * 
  * This function never returns IPv4-mapped IPv6 addresses.
  * 
  * # Typical errors
  * - `name-unresolvable`:          Name does not exist or has no suitable associated IP addresses. (EAI_NONAME, EAI_NODATA, EAI_ADDRFAMILY)
  * - `temporary-resolver-failure`: A temporary failure in name resolution occurred. (EAI_AGAIN)
  * - `permanent-resolver-failure`: A permanent failure in name resolution occurred. (EAI_FAIL)
  * - `would-block`:                A result is not available yet. (EWOULDBLOCK, EAGAIN)
  */
  resolveNextAddress(): IpAddress | undefined;
  /**
  * Create a `pollable` which will resolve once the stream is ready for I/O.
  * 
  * Note: this function is here for WASI Preview2 only.
  * It's planned to be removed when `future` is natively supported in Preview3.
  */
  subscribe(): Pollable;
}

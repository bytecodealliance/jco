/** @module Interface wasi:sockets/ip-name-lookup@0.3.0-rc-2026-03-15 **/
/**
 * Resolve an internet host name to a list of IP addresses.
 *
 * Unicode domain names are automatically converted to ASCII using IDNA
 * encoding. If the input is an IP address string, the address is parsed
 * and returned as-is without making any external requests.
 *
 * See the wasi-socket proposal README.md for a comparison with getaddrinfo.
 *
 * The results are returned in connection order preference.
 *
 * This function never succeeds with 0 results. It either fails or succeeds
 * with at least one address. Additionally, this function never returns
 * IPv4-mapped IPv6 addresses.
 *
 * # References:
 * - <https://pubs.opengroup.org/onlinepubs/9699919799/functions/getaddrinfo.html>
 * - <https://man7.org/linux/man-pages/man3/getaddrinfo.3.html>
 * - <https://learn.microsoft.com/en-us/windows/win32/api/ws2tcpip/nf-ws2tcpip-getaddrinfo>
 * - <https://man.freebsd.org/cgi/man.cgi?query=getaddrinfo&sektion=3>
 */
export function resolveAddresses(name: string): Promise<Array<IpAddress>>;
export type IpAddress = import('./wasi-sockets-types.js').IpAddress;
/**
 * Lookup error codes.
 */
export type ErrorCode = ErrorCodeAccessDenied | ErrorCodeInvalidArgument | ErrorCodeNameUnresolvable | ErrorCodeTemporaryResolverFailure | ErrorCodePermanentResolverFailure | ErrorCodeOther;
/**
 * Access denied.
 *
 * POSIX equivalent: EACCES, EPERM
 */
export interface ErrorCodeAccessDenied {
  tag: 'access-denied',
}
/**
 * `name` is a syntactically invalid domain name or IP address.
 *
 * POSIX equivalent: EINVAL
 */
export interface ErrorCodeInvalidArgument {
  tag: 'invalid-argument',
}
/**
 * Name does not exist or has no suitable associated IP addresses.
 *
 * POSIX equivalent: EAI_NONAME, EAI_NODATA, EAI_ADDRFAMILY
 */
export interface ErrorCodeNameUnresolvable {
  tag: 'name-unresolvable',
}
/**
 * A temporary failure in name resolution occurred.
 *
 * POSIX equivalent: EAI_AGAIN
 */
export interface ErrorCodeTemporaryResolverFailure {
  tag: 'temporary-resolver-failure',
}
/**
 * A permanent failure in name resolution occurred.
 *
 * POSIX equivalent: EAI_FAIL
 */
export interface ErrorCodePermanentResolverFailure {
  tag: 'permanent-resolver-failure',
}
/**
 * A catch-all for errors not captured by the existing variants.
 * Implementations can use this to extend the error type without
 * breaking existing code.
 */
export interface ErrorCodeOther {
  tag: 'other',
  val: string | undefined,
}

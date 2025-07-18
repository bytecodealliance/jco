/** @module Interface wasi:sockets/ip-name-lookup@0.3.0 **/
/**
 * Resolve an internet host name to a list of IP addresses.
 *
 * Unicode domain names are automatically converted to ASCII using IDNA encoding.
 * If the input is an IP address string, the address is parsed and returned
 * as-is without making any external requests.
 *
 * See the wasi-socket proposal README.md for a comparison with getaddrinfo.
 *
 * The results are returned in connection order preference.
 *
 * This function never succeeds with 0 results. It either fails or succeeds
 * with at least one address. Additionally, this function never returns
 * IPv4-mapped IPv6 addresses.
 *
 * The returned future will resolve to an error code in case of failure.
 * It will resolve to success once the returned stream is exhausted.
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
 * ## `"invalid-argument"`
 *
 * `name` is a syntactically invalid domain name or IP address.
 *
 * POSIX equivalent: EINVAL
 * ## `"name-unresolvable"`
 *
 * Name does not exist or has no suitable associated IP addresses.
 *
 * POSIX equivalent: EAI_NONAME, EAI_NODATA, EAI_ADDRFAMILY
 * ## `"temporary-resolver-failure"`
 *
 * A temporary failure in name resolution occurred.
 *
 * POSIX equivalent: EAI_AGAIN
 * ## `"permanent-resolver-failure"`
 *
 * A permanent failure in name resolution occurred.
 *
 * POSIX equivalent: EAI_FAIL
 */
export type ErrorCode =
    | 'unknown'
    | 'access-denied'
    | 'invalid-argument'
    | 'name-unresolvable'
    | 'temporary-resolver-failure'
    | 'permanent-resolver-failure';

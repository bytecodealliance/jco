/**
 * @typedef {import("../../../types/interfaces/wasi-sockets-network.js").IpSocketAddress} IpSocketAddress
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp.js").IpAddressFamily} IpAddressFamily
 * @typedef {import("../../../types/interfaces/wasi-sockets-tcp").TcpSocket} TcpSocket
 * @typedef {import("../../../types/interfaces/wasi-sockets-udp").UdpSocket} UdpSocket
 */

export function tupleToIPv6(arr) {
  if (arr.length !== 8) {
    return null;
  }
  return arr.map((segment) => segment.toString(16)).join(":");
}

export function tupleToIpv4(arr) {
  if (arr.length !== 4) {
    return null;
  }
  return arr.map((segment) => segment.toString(10)).join(".");
}

/**
 * @param {IpSocketAddress} ipSocketAddress
 * @returns {boolean}
 */
export function isMulticastIpAddress(ipSocketAddress) {
  return (
    (ipSocketAddress.tag === "ipv4" &&
      ipSocketAddress.val.address[0] === 0xe0) ||
    (ipSocketAddress.tag === "ipv6" &&
      ipSocketAddress.val.address[0] === 0xff00)
  );
}

/**
 * @param {IpSocketAddress} ipSocketAddress
 * @returns {boolean}
 */
export function isIPv4MappedAddress(ipSocketAddress) {
  return (
    ipSocketAddress.tag === "ipv6" && ipSocketAddress.val.address[5] === 0xffff
  );
}

/**
 * @param {IpSocketAddress} ipSocketAddress
 * @returns {boolean}
 */
export function isUnicastIpAddress(ipSocketAddress) {
  return (
    !isMulticastIpAddress(ipSocketAddress) &&
    !isBroadcastIpAddress(ipSocketAddress)
  );
}

/**
 * @param {IpSocketAddress} isWildcardAddress
 * @returns {boolean}
 */
export function isWildcardAddress(ipSocketAddress) {
  const { address } = ipSocketAddress.val;
  if (ipSocketAddress.tag === "ipv4")
    return (
      address[0] === 0 &&
      address[1] === 0 &&
      address[2] === 0 &&
      address[3] === 0
    );
  else
    return (
      address[0] === 0 &&
      address[1] === 0 &&
      address[2] === 0 &&
      address[3] === 0 &&
      address[4] === 0 &&
      address[5] === 0 &&
      address[6] === 0 &&
      address[7] === 0
    );
}

/**
 * @param {IpSocketAddress} isWildcardAddress
 * @returns {boolean}
 */
export function isBroadcastIpAddress(ipSocketAddress) {
  const { address } = ipSocketAddress.val;
  return (
    ipSocketAddress.tag === "ipv4" &&
    address[0] === 0xff &&
    address[1] === 0xff &&
    address[2] === 0xff &&
    address[3] === 0xff
  );
}

/**
 *
 * @param {IpSocketAddress} addr
 * @param {boolean} includePort
 * @returns {string}
 */
export function serializeIpAddress(addr) {
  if (addr.tag === "ipv4") return tupleToIpv4(addr.val.address);
  return tupleToIPv6(addr.val.address);
}

export function ipv6ToTuple(ipv6) {
  const [lhs, rhs = ""] = ipv6.includes("::") ? ipv6.split("::") : [ipv6];
  const lhsParts = lhs === "" ? [] : lhs.split(":");
  const rhsParts = rhs === "" ? [] : rhs.split(":");
  return [
    ...lhsParts,
    ...Array(8 - lhsParts.length - rhsParts.length).fill(0),
    ...rhsParts,
  ].map((segment) => parseInt(segment, 16));
}

export function ipv4ToTuple(ipv4) {
  return ipv4.split(".").map((segment) => parseInt(segment, 10));
}

/**
 *
 * @param {string} addr
 * @param {IpAddressFamily} family
 * @returns {IpSocketAddress}
 */
export function deserializeIpAddress(addr, family) {
  if (family === "ipv4") return ipv4ToTuple(addr);
  return ipv6ToTuple(addr);
}

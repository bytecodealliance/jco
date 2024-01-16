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
  // ipv6: [0xff00, 0, 0, 0, 0, 0, 0, 0]
  // ipv4: [0xe0, 0, 0, 0]
  return (
    ipSocketAddress.val.address[0] === 0xe0 ||
    ipSocketAddress.val.address[0] === 0xff00
  );
}

/**
 * @param {IpSocketAddress} ipSocketAddress
 * @returns {boolean}
 */
export function isIPv4MappedAddress(ipSocketAddress) {
  // ipv6: [0, 0, 0, 0, 0, 0xffff, 0, 0]
  if (ipSocketAddress.val.address.length !== 8) {
    return false;
  }
  return ipSocketAddress.val.address[5] === 0xffff;
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
  // ipv6: [0, 0, 0, 0, 0, 0, 0, 0]
  // ipv4: [0, 0, 0, 0]
  return ipSocketAddress.val.address.every((segment) => segment === 0);
}

/**
 * @param {IpSocketAddress} isWildcardAddress
 * @returns {boolean}
 */
export function isBroadcastIpAddress(ipSocketAddress) {
  // ipv4: [255, 255, 255, 255]
  return (
    ipSocketAddress.val.address[0] === 0xff && // 255
    ipSocketAddress.val.address[1] === 0xff && // 255
    ipSocketAddress.val.address[2] === 0xff && // 255
    ipSocketAddress.val.address[3] === 0xff // 255
  );
}

/**
 * 
 * @param {IpSocketAddress} addr 
 * @param {boolean} includePort 
 * @returns {string}
 */
export function serializeIpAddress(addr) {
  if (addr.tag === "ipv4")
    return tupleToIpv4(addr.val.address);
  return tupleToIPv6(addr.val.address);
}

export function ipv6ToTuple(ipv6) {
  if (ipv6 === "::1") {
    return [0, 0, 0, 0, 0, 0, 0, 1];
  } else if (ipv6 === "::") {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  } else if (ipv6.includes("::")) {
    const [head, tail] = ipv6.split("::");
    const headSegments = head.split(":").map((segment) => parseInt(segment, 16));
    const tailSegments = tail.split(":").map((segment) => parseInt(segment, 16));
    const missingSegments = 8 - headSegments.length - tailSegments.length;
    const middleSegments = Array(missingSegments).fill(0);
    return headSegments.concat(middleSegments).concat(tailSegments);
  }
  return ipv6.split(":").map((segment) => parseInt(segment, 16));
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
  if (family === "ipv4")
    return ipv4ToTuple(addr);
  return ipv6ToTuple(addr);
}

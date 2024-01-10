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
 * 
 * @param {IpSocketAddress} addr 
 * @param {boolean} includePort 
 * @returns {string}
 */
export function serializeIpAddress(addr, includePort) {
  if (includePort)
    return `${serializeIpAddress(addr, false)}:${addr.val.port}`;
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

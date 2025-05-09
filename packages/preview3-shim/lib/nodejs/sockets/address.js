// Adapted from preview2-shim/lib/io/worker-sockets.js

// TODO(tandr): switch to generated types
export const IP_ADDRESS_FAMILY = {
  IPV4: "ipv4",
  IPV6: "ipv6",
};

export const tupleToIpv6 = (segments) => {
  if (segments.length !== 8) return null;
  return segments.map((segment) => segment.toString(16)).join(":");
};

export const tupleToIpv4 = (segments) => {
  if (segments.length !== 4) return null;
  return segments.map((segment) => segment.toString(10)).join(".");
};

export const ipv6ToTuple = (ipv6) => {
  const [lhs, rhs = ""] = ipv6.includes("::") ? ipv6.split("::") : [ipv6];
  const lhsParts = lhs === "" ? [] : lhs.split(":");
  const rhsParts = rhs === "" ? [] : rhs.split(":");
  return [
    ...lhsParts,
    ...Array(8 - lhsParts.length - rhsParts.length).fill(0),
    ...rhsParts,
  ].map((segment) => parseInt(segment, 16));
};

export const ipv4ToTuple = (ipv4) => {
  return ipv4.split(".").map((segment) => parseInt(segment, 10));
};

export const isMulticastIpAddress = ({ tag, val: { address } }) =>
  (tag === "ipv4" && address[0] >= 0xe0 && address[0] <= 0xef) ||
  (tag === "ipv6" && address[0] === 0xff);

export const isIpv4MappedAddress = ({ tag, val: { address } }) =>
  tag === "ipv6" &&
  address[0] === 0 &&
  address[1] === 0 &&
  address[2] === 0 &&
  address[3] === 0 &&
  address[4] === 0 &&
  address[5] === 0xffff;

export const isWildcardIpAddress = ({ tag, val: { address } }) =>
  address.every((b) => b === 0);

export const isBroadcastIpAddress = ({ tag, val: { address } }) =>
  tag === "ipv4" && address.every((b) => b === 0xff);

export const isUnicastIpAddress = (a) =>
  !isMulticastIpAddress(a) && !isBroadcastIpAddress(a) && !isWildcardAddress(a);

export const serializeIpAddress = ({ tag, val: { address } }) =>
  tag === "ipv4" ? tupleToIpv4(address) : tupleToIpv6(address);

export const makeIpSocketAddress = (family, host, port) => {
  const address = family === "ipv4" ? ipv4ToTuple(host) : ipv6ToTuple(host);

  const base = { address, port };
  return family === "ipv4"
    ? { tag: "ipv4", val: base }
    : { tag: "ipv6", val: { ...base, flowInfo: 0, scopeId: 0 } };
};

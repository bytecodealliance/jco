import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { createSocket } from "node:dgram";
import {
  ALL,
  BADFAMILY,
  CANCELLED,
  CONNREFUSED,
  NODATA,
  NOMEM,
  NONAME,
  NOTFOUND,
  REFUSED,
  SERVFAIL,
  TIMEOUT,
  V4MAPPED,
} from "node:dns";
import {
  EACCES,
  EADDRINUSE,
  EADDRNOTAVAIL,
  EALREADY,
  EBADF,
  ECONNABORTED,
  ECONNREFUSED,
  ECONNRESET,
  EINVAL,
  ENOBUFS,
  ENOMEM,
  ENOTCONN,
  ENOTSUP,
  EPERM,
  EWOULDBLOCK,
} from "node:constants";
import {
  IpAddressFamily,
  IpSocketAddress,
  Ipv4Address,
  Ipv6Address,
} from "../../types/interfaces/wasi-sockets-network.js";

let stateCnt = 0;
export const SOCKET_STATE_INIT = ++stateCnt;
export const SOCKET_STATE_BIND = ++stateCnt;
export const SOCKET_STATE_BOUND = ++stateCnt;
export const SOCKET_STATE_LISTEN = ++stateCnt;
export const SOCKET_STATE_LISTENER = ++stateCnt;
export const SOCKET_STATE_CONNECT = ++stateCnt;
export const SOCKET_STATE_CONNECTION = ++stateCnt;
export const SOCKET_STATE_CLOSED = ++stateCnt;

const dnsLookupOptions = {
  verbatim: true,
  all: true,
  hints: V4MAPPED | ALL,
};

export function noLookup(ip, _opts, cb) {
  cb(null, ip);
}

export function socketResolveAddress(name: string) {
  const isIpNum = isIP(name[0] === "[" && name[name.length - 1] === "]" ? name.slice(1, -1) : name);
  if (isIpNum > 0) {
    return Promise.resolve([
      {
        tag: "ipv" + isIpNum,
        val: (isIpNum === 4 ? ipv4ToTuple : ipv6ToTuple)(name),
      },
    ]);
  }
  // verify it is a valid domain name using the URL parser
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(`https://${name}`);
    if (
      parsedUrl.port.length ||
      parsedUrl.username.length ||
      parsedUrl.password.length ||
      parsedUrl.pathname !== "/" ||
      parsedUrl.search.length ||
      parsedUrl.hash.length
    ) {
      parsedUrl = null;
    }
  } catch {
    // empty
  }
  if (!parsedUrl) {
    throw "invalid-argument";
  }

  return lookup(name, dnsLookupOptions).then(
    (addresses) => {
      return (Array.isArray(addresses) ? addresses : [addresses]).map(({ address, family }) => {
        return [
          {
            tag: "ipv" + family,
            val: (family === 4 ? ipv4ToTuple : ipv6ToTuple)(address),
          },
        ];
      });
    },
    (err) => {
      switch (err.code) {
        // TODO: verify these more carefully
        case NODATA:
        case BADFAMILY:
        case NONAME:
        case NOTFOUND:
          throw "name-unresolvable";
        case TIMEOUT:
        case REFUSED:
        case CONNREFUSED:
        case SERVFAIL:
        case NOMEM:
        case CANCELLED:
          throw "temporary-resolver-failure";
        default:
          throw "permanent-resolver-failure";
      }
    },
  );
}

export function convertSocketError(err) {
  switch (err?.code) {
    case "EBADF":
    case "ENOTCONN":
    case "ERR_SOCKET_DGRAM_NOT_CONNECTED":
      return "invalid-state";
    case "EACCES":
    case "EPERM":
      return "access-denied";
    case "ENOTSUP":
      return "not-supported";
    case "EINVAL":
      return "invalid-argument";
    case "ENOMEM":
    case "ENOBUFS":
      return "out-of-memory";
    case "EALREADY":
      return "concurrency-conflict";
    case "EWOULDBLOCK":
      return "would-block";
    // TODO: return "new-socket-limit";
    case "EADDRNOTAVAIL":
      return "address-not-bindable";
    case "EADDRINUSE":
      return "address-in-use";
    // TODO: return "remote-unreachable";
    case "ECONNREFUSED":
      return "connection-refused";
    case "ECONNRESET":
      return "connection-reset";
    case "ECONNABORTED":
      return "connection-aborted";
    default:
      return "unknown";
  }
}

export function convertSocketErrorCode(code) {
  switch (code) {
    case 4053: // windows
    case 4083:
    case ENOTCONN:
    case EBADF:
      return "invalid-state";
    case EACCES:
    case EPERM:
      return "access-denied";
    case ENOTSUP:
      return "not-supported";
    case EINVAL:
      return "invalid-argument";
    case ENOMEM:
    case ENOBUFS:
      return "out-of-memory";
    case EALREADY:
      return "concurrency-conflict";
    case EWOULDBLOCK:
      return "would-block";
    // TODO: return "new-socket-limit";
    case 4090: // windows
    case EADDRNOTAVAIL:
      return "address-not-bindable";
    case 4091: // windows
    case EADDRINUSE:
      return "address-in-use";
    // TODO: return "remote-unreachable";
    case ECONNREFUSED:
      return "connection-refused";
    case ECONNRESET:
      return "connection-reset";
    case ECONNABORTED:
      return "connection-aborted";
    // TODO: return "datagram-too-large";
    // TODO: return "name-unresolvable";
    // TODO: return "temporary-resolver-failure";
    default:
      // process._rawDebug('unknown error code', code);
      return "unknown";
  }
}

export function tupleToIPv6(arr: Ipv6Address) {
  if (arr.length !== 8) {
    return null;
  }
  return arr.map((segment) => segment.toString(16)).join(":");
}

export function tupleToIpv4(arr: Ipv4Address) {
  if (arr.length !== 4) {
    return null;
  }
  return arr.map((segment) => segment.toString(10)).join(".");
}

export function isMulticastIpAddress(ipSocketAddress: IpSocketAddress): boolean {
  return (
    (ipSocketAddress.tag === "ipv4" && ipSocketAddress.val.address[0] === 0xe0) ||
    (ipSocketAddress.tag === "ipv6" && ipSocketAddress.val.address[0] === 0xff00)
  );
}

export function isIPv4MappedAddress(ipSocketAddress: IpSocketAddress): boolean {
  return ipSocketAddress.tag === "ipv6" && ipSocketAddress.val.address[5] === 0xffff;
}

export function isUnicastIpAddress(ipSocketAddress: IpSocketAddress): boolean {
  return !isMulticastIpAddress(ipSocketAddress) && !isBroadcastIpAddress(ipSocketAddress);
}

export function isWildcardAddress(ipSocketAddress: IpSocketAddress): boolean {
  const { address } = ipSocketAddress.val;
  if (ipSocketAddress.tag === "ipv4") {
    return address[0] === 0 && address[1] === 0 && address[2] === 0 && address[3] === 0;
  } else {
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
}

export function isBroadcastIpAddress(ipSocketAddress: IpSocketAddress): boolean {
  const { address } = ipSocketAddress.val;
  return (
    ipSocketAddress.tag === "ipv4" &&
    address[0] === 0xff &&
    address[1] === 0xff &&
    address[2] === 0xff &&
    address[3] === 0xff
  );
}

export function serializeIpAddress(addr: IpSocketAddress): string | null {
  if (addr.tag === "ipv4") {
    return tupleToIpv4(addr.val.address);
  }
  return tupleToIPv6(addr.val.address);
}

export function ipv6ToTuple(ipv6: string) {
  const [lhs, rhs = ""] = ipv6.includes("::") ? ipv6.split("::") : [ipv6];
  const lhsParts = lhs === "" ? [] : lhs.split(":");
  const rhsParts = rhs === "" ? [] : rhs.split(":");
  return [...lhsParts, ...Array(8 - lhsParts.length - rhsParts.length).fill(0), ...rhsParts].map(
    (segment) => parseInt(segment, 16),
  ) as Ipv6Address;
}

export function ipv4ToTuple(ipv4: string) {
  return ipv4.split(".").map((segment) => parseInt(segment, 10)) as Ipv4Address;
}

export function ipSocketAddress(
  family: IpAddressFamily,
  addr: string,
  port: number,
): IpSocketAddress {
  if (family === "ipv4") {
    return {
      tag: "ipv4",
      val: {
        port,
        address: ipv4ToTuple(addr),
      },
    };
  }
  return {
    tag: "ipv6",
    val: {
      port,
      flowInfo: 0,
      address: ipv6ToTuple(addr),
      scopeId: 0,
    },
  };
}

let _recvBufferSize: bigint;
let _sendBufferSize: bigint;
async function getDefaultBufferSizes() {
  var s = createSocket({ type: "udp4" });
  s.bind(0);
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.once("listening", resolve);
  });
  _recvBufferSize = BigInt(s.getRecvBufferSize());
  _sendBufferSize = BigInt(s.getSendBufferSize());
  s.close();
}

export async function getDefaultSendBufferSize() {
  if (!_sendBufferSize) {
    await getDefaultBufferSizes();
  }
  return _sendBufferSize;
}

export async function getDefaultReceiveBufferSize() {
  if (!_recvBufferSize) {
    await getDefaultBufferSizes();
  }
  return _recvBufferSize;
}

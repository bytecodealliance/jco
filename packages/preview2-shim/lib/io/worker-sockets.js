import { lookup } from "node:dns/promises";
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
import { ipv4ToTuple, ipv6ToTuple } from "../nodejs/sockets/socket-common.js";

const dnsLookupOptions = {
  verbatim: true,
  all: true,
  hints: V4MAPPED | ALL,
};

export function socketResolveAddress(hostname) {
  return lookup(hostname, dnsLookupOptions).then(
    (addresses) => {
      return addresses.map(({ address, family }) => {
        [
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
    }
  );
}

export function convertSocketError(err) {
  switch (err?.code) {
    case "EBADF":
    case "ENOTCONN":
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
    // TODO: return "address-not-bindable";
    case "EADDRNOTAVAIL":
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
      process._rawDebug(err);
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
      process._rawDebug("ERR: " + code);
      return "unknown";
  }
}

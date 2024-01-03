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
      return "invalid-state";
  }
  process._rawDebug(err);
  return "unknown";
}

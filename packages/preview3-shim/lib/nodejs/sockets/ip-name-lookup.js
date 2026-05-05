import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import { ipv4ToTuple, ipv6ToTuple } from "./address.js";
import { SocketError } from "./error.js";

const DNS_ERROR_MAP = {
  EACCES: "access-denied",
  EPERM: "access-denied",
  EINVAL: "invalid-argument",
  ENOTFOUND: "name-unresolvable",
  EAI_ADDRFAMILY: "name-unresolvable",
  EAI_AGAIN: "temporary-resolver-failure",
  EAI_FAIL: "permanent-resolver-failure",
  EAI_NODATA: "name-unresolvable",
  EAI_NONAME: "name-unresolvable",
};

function ipAddress(address, family) {
  switch (family) {
    case 4:
      return { tag: "ipv4", val: ipv4ToTuple(address) };
    case 6:
      return { tag: "ipv6", val: ipv6ToTuple(address) };
    default:
      throw new SocketError("other", `Unknown IP address family: ${family}`, `${family}`);
  }
}

function normalizeLookupName(name) {
  if (typeof name !== "string" || name === "" || name.trim() !== name) {
    throw new SocketError("invalid-argument");
  }

  if (name.startsWith("[") || name.endsWith("]")) {
    const bracketedIpv6 = name.match(/^\[([^\]]+)\]$/);
    if (bracketedIpv6 && isIP(bracketedIpv6[1]) === 6) {
      return bracketedIpv6[1];
    }
    throw new SocketError("invalid-argument");
  }

  if (isIP(name) !== 0) {
    return name;
  }

  const asciiName = domainToASCII(name);
  if (asciiName === "") {
    throw new SocketError("invalid-argument");
  }
  return asciiName;
}

export const ipNameLookup = {
  /**
   * Resolve an internet host name to a list of IP addresses.
   *
   * WIT:
   * ```
   * resolve-addresses: async func(name: string) -> result<list<ip-address>, error-code>
   * ```
   *
   * @param {string} name - Host name or IP address to resolve.
   * @returns {Promise<Array<{tag: "ipv4" | "ipv6", val: number[]}>>}
   * @throws {SocketError} payload.tag maps to wasi:sockets/ip-name-lookup error-code.
   */
  async resolveAddresses(name) {
    try {
      const lookupName = normalizeLookupName(name);
      const literalFamily = isIP(lookupName);
      if (literalFamily !== 0) {
        return [ipAddress(lookupName, literalFamily)];
      }

      const addresses = await lookup(lookupName, { all: true, verbatim: false });
      const result = addresses.map(({ address, family }) => ipAddress(address, family));

      if (result.length === 0) {
        throw new SocketError("name-unresolvable");
      }
      return result;
    } catch (error) {
      if (error instanceof SocketError) {
        throw error;
      }
      const tag = DNS_ERROR_MAP[error?.code] ?? "other";
      throw new SocketError(tag, error?.message, tag === "other" ? error?.code : undefined, {
        cause: error,
      });
    }
  },
};

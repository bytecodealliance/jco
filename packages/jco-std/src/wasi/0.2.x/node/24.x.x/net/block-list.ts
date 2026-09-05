/**
 * Portable `net.BlockList`.
 *
 * Adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/blocklist.js (MIT license).
 * The native `block_list` handle is replaced by JavaScript byte/range comparisons while the
 * public validation, newest-first rule ordering, JSON format, and IPv4-mapped behavior remain.
 */

import { invalidArgType, invalidArgValue, outOfRange } from "./errors.js";
import { mappedIpv4Bytes } from "./ip.js";
import { SocketAddress, socketAddressDetails, type IPVersion } from "./socket-address.js";

type Rule =
  | { kind: "address"; address: SocketAddress; text: string }
  | { kind: "range"; start: SocketAddress; end: SocketAddress; text: string }
  | { kind: "subnet"; network: SocketAddress; prefix: number; text: string };

function address(value: string | SocketAddress, family: IPVersion, name: string): SocketAddress {
  if (SocketAddress.isSocketAddress(value)) {
    return value;
  }
  if (typeof value !== "string") {
    throw invalidArgType(name, "string", value);
  }
  const normalizedFamily = typeof family === "string" ? family.toLowerCase() : family;
  if (normalizedFamily !== "ipv4" && normalizedFamily !== "ipv6") {
    throw invalidArgValue("family", family);
  }
  return new SocketAddress({ address: value, family: normalizedFamily });
}

function numeric(value: SocketAddress): bigint {
  let result = 0n;
  for (const byte of socketAddressDetails(value).bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

function sameFamily(first: SocketAddress, second: SocketAddress): void {
  if (first.family !== second.family) {
    throw invalidArgValue("family", second.family, "must match the first address family");
  }
}

function matches(rule: Rule, candidate: SocketAddress): boolean {
  if (rule.kind === "address") {
    return rule.address.family === candidate.family && numeric(rule.address) === numeric(candidate);
  }
  if (rule.kind === "range") {
    if (rule.start.family !== candidate.family) {
      return false;
    }
    const value = numeric(candidate);
    return value >= numeric(rule.start) && value <= numeric(rule.end);
  }
  if (rule.network.family !== candidate.family) {
    return false;
  }
  const bits = candidate.family === "ipv4" ? 32 : 128;
  const shift = BigInt(bits - rule.prefix);
  return numeric(candidate) >> shift === numeric(rule.network) >> shift;
}

export class BlockList {
  readonly #rules: Rule[] = [];

  static isBlockList(value: unknown): value is BlockList {
    return value instanceof BlockList;
  }

  addAddress(value: string | SocketAddress, family: IPVersion = "ipv4"): void {
    const parsed = address(value, family, "address");
    this.#rules.unshift({
      kind: "address",
      address: parsed,
      text: `Address: ${parsed.family === "ipv4" ? "IPv4" : "IPv6"} ${parsed.address}`,
    });
  }

  addRange(
    startValue: string | SocketAddress,
    endValue: string | SocketAddress,
    family: IPVersion = "ipv4",
  ): void {
    const start = address(startValue, family, "start");
    const end = address(endValue, family, "end");
    sameFamily(start, end);
    if (numeric(start) > numeric(end)) {
      throw invalidArgValue("start", start, "must come before end");
    }
    this.#rules.unshift({
      kind: "range",
      start,
      end,
      text: `Range: ${start.family === "ipv4" ? "IPv4" : "IPv6"} ${start.address}-${end.address}`,
    });
  }

  addSubnet(
    networkValue: string | SocketAddress,
    prefix: number,
    family: IPVersion = "ipv4",
  ): void {
    const network = address(networkValue, family, "network");
    const maximum = network.family === "ipv4" ? 32 : 128;
    if (typeof prefix !== "number") {
      throw invalidArgType("prefix", "number", prefix);
    }
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maximum) {
      throw outOfRange("prefix", `>= 0 and <= ${maximum}`, prefix);
    }
    this.#rules.unshift({
      kind: "subnet",
      network,
      prefix: Object.is(prefix, -0) ? 0 : prefix,
      text: `Subnet: ${network.family === "ipv4" ? "IPv4" : "IPv6"} ${network.address}/${prefix}`,
    });
  }

  check(value: string | SocketAddress, family: IPVersion = "ipv4"): boolean {
    if (!SocketAddress.isSocketAddress(value) && typeof value !== "string") {
      throw invalidArgType("address", "string", value);
    }
    let candidate: SocketAddress;
    try {
      candidate = address(value, family, "address");
    } catch {
      return false;
    }
    if (this.#rules.some((rule) => matches(rule, candidate))) {
      return true;
    }
    if (candidate.family === "ipv4") {
      const mapped = new SocketAddress({ address: `::ffff:${candidate.address}`, family: "ipv6" });
      return this.#rules.some((rule) => matches(rule, mapped));
    }
    if (candidate.family === "ipv6") {
      const mapped = mappedIpv4Bytes(socketAddressDetails(candidate).bytes);
      if (mapped) {
        const ipv4 = new SocketAddress({ address: Array.from(mapped).join("."), family: "ipv4" });
        return this.#rules.some((rule) => matches(rule, ipv4));
      }
    }
    return false;
  }

  get rules(): readonly string[] {
    return this.#rules.map((rule) => rule.text);
  }

  toJSON(): readonly string[] {
    return this.rules;
  }

  fromJSON(data: string | readonly string[]): void {
    let rules: unknown = data;
    if (typeof rules === "string") {
      rules = JSON.parse(rules) as unknown;
    }
    if (!Array.isArray(rules) || !rules.every((rule) => typeof rule === "string")) {
      throw invalidArgType("data", ["string", "string[]"], data);
    }
    for (const rule of rules) {
      if (rule.includes("IPv4")) {
        let match = /Subnet: IPv4 (\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})/.exec(rule);
        if (match) {
          this.addSubnet(match[1], Number.parseInt(match[2]));
          continue;
        }
        match = /Address: IPv4 (\d{1,3}(?:\.\d{1,3}){3})/.exec(rule);
        if (match) {
          this.addAddress(match[1]);
          continue;
        }
        match = /Range: IPv4 (\d{1,3}(?:\.\d{1,3}){3})-(\d{1,3}(?:\.\d{1,3}){3})/.exec(rule);
        if (match) {
          this.addRange(match[1], match[2]);
          continue;
        }
      }
      if (rule.includes("IPv6")) {
        let match = /Subnet: IPv6 ([0-9a-fA-F:]{1,39})\/([0-9]{1,3})/i.exec(rule);
        if (match) {
          this.addSubnet(match[1], Number.parseInt(match[2]), "ipv6");
          continue;
        }
        match = /Address: IPv6 ([0-9a-fA-F:]{1,39})/i.exec(rule);
        if (match) {
          this.addAddress(match[1], "ipv6");
          continue;
        }
        match = /Range: IPv6 ([0-9a-fA-F:]{1,39})-([0-9a-fA-F:]{1,39})/i.exec(rule);
        if (match) {
          this.addRange(match[1], match[2], "ipv6");
        }
      }
    }
  }
}

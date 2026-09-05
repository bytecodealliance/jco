/**
 * IP address predicates and portable parsing helpers.
 *
 * The regular expressions are mechanically adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/net.js (MIT license). Node calls the
 * native predicates from `lib/net.js`; the local helpers additionally turn accepted addresses
 * into bytes because a component has no `block_list` native binding.
 */

const V4_SEGMENT = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])";
const V4_SOURCE = `(?:${V4_SEGMENT}\\.){3}${V4_SEGMENT}`;
const IPV4 = new RegExp(`^${V4_SOURCE}$`);
const V6_SEGMENT = "(?:[0-9a-fA-F]{1,4})";
const IPV6 = new RegExp(
  "^(?:" +
    `(?:${V6_SEGMENT}:){7}(?:${V6_SEGMENT}|:)|` +
    `(?:${V6_SEGMENT}:){6}(?:${V4_SOURCE}|:${V6_SEGMENT}|:)|` +
    `(?:${V6_SEGMENT}:){5}(?::${V4_SOURCE}|(?::${V6_SEGMENT}){1,2}|:)|` +
    `(?:${V6_SEGMENT}:){4}(?:(?::${V6_SEGMENT}){0,1}:${V4_SOURCE}|(?::${V6_SEGMENT}){1,3}|:)|` +
    `(?:${V6_SEGMENT}:){3}(?:(?::${V6_SEGMENT}){0,2}:${V4_SOURCE}|(?::${V6_SEGMENT}){1,4}|:)|` +
    `(?:${V6_SEGMENT}:){2}(?:(?::${V6_SEGMENT}){0,3}:${V4_SOURCE}|(?::${V6_SEGMENT}){1,5}|:)|` +
    `(?:${V6_SEGMENT}:){1}(?:(?::${V6_SEGMENT}){0,4}:${V4_SOURCE}|(?::${V6_SEGMENT}){1,6}|:)|` +
    `(?::(?:(?::${V6_SEGMENT}){0,5}:${V4_SOURCE}|(?::${V6_SEGMENT}){1,7}|:))` +
    ")(?:%[0-9a-zA-Z-.:]{1,})?$",
);

export type IpFamily = 4 | 6;

export interface ParsedIpAddress {
  family: IpFamily;
  bytes: Uint8Array;
  canonical: string;
}

export function isIPv4(input: unknown): input is string {
  return typeof input === "string" && IPV4.test(input);
}

export function isIPv6(input: unknown): input is string {
  return typeof input === "string" && IPV6.test(input);
}

export function isIP(input: unknown): 0 | IpFamily {
  return isIPv4(input) ? 4 : isIPv6(input) ? 6 : 0;
}

export function parseIpv4(input: string): Uint8Array | undefined {
  return isIPv4(input) ? Uint8Array.from(input.split(".").map(Number)) : undefined;
}

function hextets(input: string): number[] | undefined {
  let value = input;
  const zone = value.indexOf("%");
  if (zone !== -1) {
    value = value.slice(0, zone);
  }
  const ipv4Text = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Text) {
    const ipv4 = parseIpv4(ipv4Text);
    if (!ipv4) {
      return undefined;
    }
    value = `${value.slice(0, -ipv4Text.length)}${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) {
    return undefined;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 ? left.length !== 8 : left.length + right.length > 7) {
    return undefined;
  }
  const fill = new Array<number>(8 - left.length - right.length).fill(0);
  return [
    ...left.map((part) => Number.parseInt(part, 16)),
    ...fill,
    ...right.map((part) => Number.parseInt(part, 16)),
  ];
}

export function parseIpv6(input: string): Uint8Array | undefined {
  if (!isIPv6(input)) {
    return undefined;
  }
  const parts = hextets(input);
  if (!parts || parts.length !== 8) {
    return undefined;
  }
  const bytes = new Uint8Array(16);
  parts.forEach((part, index) => {
    bytes[index * 2] = part >>> 8;
    bytes[index * 2 + 1] = part & 0xff;
  });
  return bytes;
}

function mappedIpv4(bytes: Uint8Array): string | undefined {
  if (
    bytes.length === 16 &&
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  ) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  return undefined;
}

export function canonicalIpv6(bytes: Uint8Array): string {
  const mapped = mappedIpv4(bytes);
  if (mapped) {
    return `::ffff:${mapped}`;
  }
  const parts = Array.from({ length: 8 }, (_, index) =>
    ((bytes[index * 2] << 8) | bytes[index * 2 + 1]).toString(16),
  );
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < parts.length; ) {
    if (parts[start] !== "0") {
      start += 1;
      continue;
    }
    let end = start + 1;
    while (end < parts.length && parts[end] === "0") {
      end += 1;
    }
    if (end - start > bestLength && end - start > 1) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  if (bestStart === -1) {
    return parts.join(":");
  }
  return `${parts.slice(0, bestStart).join(":")}::${parts.slice(bestStart + bestLength).join(":")}`;
}

export function parseIp(input: string, family?: "ipv4" | "ipv6"): ParsedIpAddress | undefined {
  if (family !== "ipv6") {
    const bytes = parseIpv4(input);
    if (bytes) {
      return { family: 4, bytes, canonical: Array.from(bytes).join(".") };
    }
  }
  if (family !== "ipv4") {
    const bytes = parseIpv6(input);
    if (bytes) {
      return { family: 6, bytes, canonical: canonicalIpv6(bytes) };
    }
  }
  return undefined;
}

export function mappedIpv4Bytes(bytes: Uint8Array): Uint8Array | undefined {
  return mappedIpv4(bytes) === undefined ? undefined : bytes.slice(12);
}

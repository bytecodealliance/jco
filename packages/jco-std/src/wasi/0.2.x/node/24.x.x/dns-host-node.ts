import dns from "node:dns";
import dnsPromises from "node:dns/promises";

import type {
  CaaRecord,
  DnsAddressWithTtl,
  DnsAnyRecord,
  DnsErrorData,
  DnsHost,
  DnsHostFamily,
  DnsHostResultOrder,
  DnsLookupAddress,
  DnsLookupOptions,
  DnsResolverConfig,
  DnsResult,
  DnsTlsaRecord,
  MxRecord,
  NaptrRecord,
  SoaRecord,
  SrvRecord,
} from "./dns/types.js";

type AsyncResult<T> = Promise<DnsResult<T>>;
type ResolverTarget = typeof dnsPromises | dnsPromises.Resolver;

function serializeError(error: unknown): DnsErrorData {
  const value =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const errno =
    typeof value.errno === "number"
      ? { tag: "number" as const, val: BigInt(value.errno) }
      : typeof value.errno === "string"
        ? { tag: "symbolic" as const, val: value.errno }
        : undefined;
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: typeof value.message === "string" ? value.message : String(error),
    code: typeof value.code === "string" ? value.code : undefined,
    errno,
    syscall: typeof value.syscall === "string" ? value.syscall : undefined,
    hostname: typeof value.hostname === "string" ? value.hostname : undefined,
  };
}

function capture<T>(operation: () => T): DnsResult<T> {
  try {
    return { tag: "ok", val: operation() };
  } catch (error) {
    return { tag: "err", val: serializeError(error) };
  }
}

async function captureAsync<T>(operation: () => Promise<T>): AsyncResult<T> {
  try {
    return { tag: "ok", val: await operation() };
  } catch (error) {
    return { tag: "err", val: serializeError(error) };
  }
}

function target(configuration?: DnsResolverConfig): ResolverTarget {
  if (!configuration) {
    return dnsPromises;
  }
  const resolver = new dnsPromises.Resolver(configuration.options);
  if (configuration.servers) {
    resolver.setServers(configuration.servers);
  }
  if (configuration.localAddress) {
    resolver.setLocalAddress(...configuration.localAddress);
  }
  return resolver;
}

function family(value: DnsHostFamily): 0 | 4 | 6 {
  return value === "ipv4" ? 4 : value === "ipv6" ? 6 : 0;
}

function hostFamily(value: number): DnsHostFamily {
  return value === 4 ? "ipv4" : value === 6 ? "ipv6" : "unspecified";
}

function order(value: DnsHostResultOrder): "ipv4first" | "ipv6first" | "verbatim" {
  return value === "ipv4-first" ? "ipv4first" : value === "ipv6-first" ? "ipv6first" : value;
}

function hints(value: number): number {
  let result = 0;
  if (value & 32) {
    result |= dns.ADDRCONFIG;
  }
  if (value & 16) {
    result |= dns.ALL;
  }
  if (value & 8) {
    result |= dns.V4MAPPED;
  }
  return result;
}

function tlsa(value: {
  certUsage: number;
  selector: number;
  match: number;
  data: ArrayBuffer;
}): DnsTlsaRecord {
  return {
    certUsage: value.certUsage,
    selector: value.selector,
    match: value.match,
    data: new Uint8Array(value.data),
  };
}

function anyRecord(
  value: Awaited<ReturnType<dnsPromises.Resolver["resolveAny"]>>[number],
): DnsAnyRecord {
  switch (value.type) {
    case "A":
      return { tag: "a", val: { address: value.address, ttl: value.ttl } };
    case "AAAA":
      return { tag: "aaaa", val: { address: value.address, ttl: value.ttl } };
    case "CAA":
      return { tag: "caa", val: value };
    case "CNAME":
      return { tag: "cname", val: value.value };
    case "MX":
      return { tag: "mx", val: value };
    case "NAPTR":
      return { tag: "naptr", val: value };
    case "NS":
      return { tag: "ns", val: value.value };
    case "PTR":
      return { tag: "ptr", val: value.value };
    case "SOA":
      return { tag: "soa", val: value };
    case "SRV":
      return { tag: "srv", val: value };
    case "TLSA":
      return { tag: "tlsa", val: tlsa(value) };
    case "TXT":
      return { tag: "txt", val: value.entries };
  }
}

/** Read the process-wide DNS server list without performing a network query. */
export const getServers: DnsHost["getServers"] = () => capture(() => dns.getServers());

/** Validate a server list with Node's Resolver parser without mutating global state. */
export const validateServers: DnsHost["validateServers"] = (servers) =>
  capture(() => {
    const resolver = new dns.Resolver();
    resolver.setServers(servers);
    return resolver.getServers();
  });

export async function lookup(
  hostname: string,
  options: DnsLookupOptions,
): AsyncResult<DnsLookupAddress[]> {
  return captureAsync(async () => {
    const result = await dnsPromises.lookup(hostname, {
      family: family(options.family),
      hints: hints(options.hints),
      all: options.all,
      order: order(options.order),
    });
    const addresses = Array.isArray(result) ? result : [result];
    return addresses.map((address) => ({
      address: address.address,
      family: hostFamily(address.family),
    }));
  });
}

export async function lookupService(
  address: string,
  port: number,
): AsyncResult<{ hostname: string; service: string }> {
  return captureAsync(() => dnsPromises.lookupService(address, port));
}

async function resolveAddressRecords(
  recordFamily: "resolve4" | "resolve6",
  hostname: string,
  ttl: boolean,
  configuration?: DnsResolverConfig,
): AsyncResult<DnsAddressWithTtl[]> {
  return captureAsync(async () => {
    const records = await target(configuration)[recordFamily](hostname, { ttl });
    return records.map((record) =>
      typeof record === "string" ? { address: record, ttl: 0 } : record,
    );
  });
}

export function resolve4(
  hostname: string,
  ttl: boolean,
  configuration?: DnsResolverConfig,
): AsyncResult<DnsAddressWithTtl[]> {
  return resolveAddressRecords("resolve4", hostname, ttl, configuration);
}

export function resolve6(
  hostname: string,
  ttl: boolean,
  configuration?: DnsResolverConfig,
): AsyncResult<DnsAddressWithTtl[]> {
  return resolveAddressRecords("resolve6", hostname, ttl, configuration);
}

export async function resolveAny(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<DnsAnyRecord[]> {
  return captureAsync(async () =>
    (await target(configuration).resolveAny(hostname)).map(anyRecord),
  );
}

export async function resolveCaa(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<CaaRecord[]> {
  return captureAsync(() => target(configuration).resolveCaa(hostname));
}

export async function resolveCname(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<string[]> {
  return captureAsync(() => target(configuration).resolveCname(hostname));
}

export async function resolveMx(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<MxRecord[]> {
  return captureAsync(() => target(configuration).resolveMx(hostname));
}

export async function resolveNaptr(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<NaptrRecord[]> {
  return captureAsync(() => target(configuration).resolveNaptr(hostname));
}

export async function resolveNs(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<string[]> {
  return captureAsync(() => target(configuration).resolveNs(hostname));
}

export async function resolvePtr(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<string[]> {
  return captureAsync(() => target(configuration).resolvePtr(hostname));
}

export async function resolveSoa(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<SoaRecord> {
  return captureAsync(() => target(configuration).resolveSoa(hostname));
}

export async function resolveSrv(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<SrvRecord[]> {
  return captureAsync(() => target(configuration).resolveSrv(hostname));
}

export async function resolveTlsa(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<DnsTlsaRecord[]> {
  return captureAsync(async () => (await target(configuration).resolveTlsa(hostname)).map(tlsa));
}

export async function resolveTxt(
  hostname: string,
  configuration?: DnsResolverConfig,
): AsyncResult<string[][]> {
  return captureAsync(() => target(configuration).resolveTxt(hostname));
}

export async function reverse(
  ip: string,
  configuration?: DnsResolverConfig,
): AsyncResult<string[]> {
  return captureAsync(() => target(configuration).reverse(ip));
}

const host = {
  getServers,
  validateServers,
  lookup,
  lookupService,
  resolve4,
  resolve6,
  resolveAny,
  resolveCaa,
  resolveCname,
  resolveMx,
  resolveNaptr,
  resolveNs,
  resolvePtr,
  resolveSoa,
  resolveSrv,
  resolveTlsa,
  resolveTxt,
  reverse,
};

export default host;

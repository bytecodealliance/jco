import type { HostErrno, HostErrorBase, HostResult } from "../internal/wit-types.js";

export type DnsResultOrder = "ipv4first" | "ipv6first" | "verbatim";
export type DnsFamily = 0 | 4 | 6;

export interface LookupOptions {
  family?: DnsFamily | "IPv4" | "IPv6";
  hints?: number;
  all?: boolean;
  order?: DnsResultOrder;
  /** @deprecated Use `order` instead. */
  verbatim?: boolean;
}

export interface LookupOneOptions extends LookupOptions {
  all?: false;
}

export interface LookupAllOptions extends LookupOptions {
  all: true;
}

export interface LookupAddress {
  address: string;
  family: number;
}

export interface ResolveOptions {
  ttl: boolean;
}

export interface ResolveWithTtlOptions extends ResolveOptions {
  ttl: true;
}

export interface RecordWithTtl {
  address: string;
  ttl: number;
}

export interface CaaRecord {
  critical: number;
  issue?: string;
  issuewild?: string;
  iodef?: string;
  contactemail?: string;
  contactphone?: string;
}

export interface MxRecord {
  priority: number;
  exchange: string;
}

export interface NaptrRecord {
  flags: string;
  service: string;
  regexp: string;
  replacement: string;
  order: number;
  preference: number;
}

export interface SoaRecord {
  nsname: string;
  hostmaster: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minttl: number;
}

export interface SrvRecord {
  priority: number;
  weight: number;
  port: number;
  name: string;
}

export interface TlsaRecord {
  certUsage: number;
  selector: number;
  match: number;
  data: ArrayBuffer;
}

export type AnyRecord =
  | ({ type: "A" | "AAAA" } & RecordWithTtl)
  | ({ type: "CAA" } & CaaRecord)
  | { type: "CNAME" | "NS" | "PTR"; value: string }
  | ({ type: "MX" } & MxRecord)
  | ({ type: "NAPTR" } & NaptrRecord)
  | ({ type: "SOA" } & SoaRecord)
  | ({ type: "SRV" } & SrvRecord)
  | ({ type: "TLSA" } & TlsaRecord)
  | { type: "TXT"; entries: string[] };

export interface ResolverOptions {
  timeout?: number;
  tries?: number;
  maxTimeout?: number;
}

export interface DnsErrorData extends HostErrorBase {
  hostname?: string;
}

export type DnsResult<T> = HostResult<T, DnsErrorData>;

export type DnsErrno = HostErrno;

export type DnsHostFamily = "unspecified" | "ipv4" | "ipv6";
export type DnsHostResultOrder = "ipv4-first" | "ipv6-first" | "verbatim";

export interface DnsResolverOptions {
  timeout?: number;
  tries?: number;
  maxTimeout?: number;
}

export interface DnsResolverConfig {
  options: DnsResolverOptions;
  servers?: string[];
  localAddress?: [string, string];
}

export interface DnsLookupOptions {
  family: DnsHostFamily;
  hints: number;
  all: boolean;
  order: DnsHostResultOrder;
}

export interface DnsLookupAddress {
  address: string;
  family: DnsHostFamily;
}

export interface DnsLookupServiceResult {
  hostname: string;
  service: string;
}

export interface DnsAddressWithTtl {
  address: string;
  ttl: number;
}

export interface DnsTlsaRecord {
  certUsage: number;
  selector: number;
  match: number;
  data: Uint8Array;
}

export type DnsAnyRecord =
  | { tag: "a" | "aaaa"; val: DnsAddressWithTtl }
  | { tag: "caa"; val: CaaRecord }
  | { tag: "cname" | "ns" | "ptr"; val: string }
  | { tag: "mx"; val: MxRecord }
  | { tag: "naptr"; val: NaptrRecord }
  | { tag: "soa"; val: SoaRecord }
  | { tag: "srv"; val: SrvRecord }
  | { tag: "tlsa"; val: DnsTlsaRecord }
  | { tag: "txt"; val: string[] };

export interface DnsHost {
  getServers(): DnsResult<string[]>;
  validateServers(servers: string[]): DnsResult<string[]>;
  lookup(hostname: string, options: DnsLookupOptions): DnsResult<DnsLookupAddress[]>;
  lookupService(address: string, port: number): DnsResult<DnsLookupServiceResult>;
  resolve4(
    hostname: string,
    ttl: boolean,
    resolver?: DnsResolverConfig,
  ): DnsResult<DnsAddressWithTtl[]>;
  resolve6(
    hostname: string,
    ttl: boolean,
    resolver?: DnsResolverConfig,
  ): DnsResult<DnsAddressWithTtl[]>;
  resolveAny(hostname: string, resolver?: DnsResolverConfig): DnsResult<DnsAnyRecord[]>;
  resolveCaa(hostname: string, resolver?: DnsResolverConfig): DnsResult<CaaRecord[]>;
  resolveCname(hostname: string, resolver?: DnsResolverConfig): DnsResult<string[]>;
  resolveMx(hostname: string, resolver?: DnsResolverConfig): DnsResult<MxRecord[]>;
  resolveNaptr(hostname: string, resolver?: DnsResolverConfig): DnsResult<NaptrRecord[]>;
  resolveNs(hostname: string, resolver?: DnsResolverConfig): DnsResult<string[]>;
  resolvePtr(hostname: string, resolver?: DnsResolverConfig): DnsResult<string[]>;
  resolveSoa(hostname: string, resolver?: DnsResolverConfig): DnsResult<SoaRecord>;
  resolveSrv(hostname: string, resolver?: DnsResolverConfig): DnsResult<SrvRecord[]>;
  resolveTlsa(hostname: string, resolver?: DnsResolverConfig): DnsResult<DnsTlsaRecord[]>;
  resolveTxt(hostname: string, resolver?: DnsResolverConfig): DnsResult<string[][]>;
  reverse(ip: string, resolver?: DnsResolverConfig): DnsResult<string[]>;
}

export interface DnsError extends Error {
  code?: string;
  errno?: number | string;
  syscall?: string;
  hostname?: string;
}

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

export interface DnsHost {
  query(request: string): string;
}

export interface DnsErrorData {
  name: string;
  message: string;
  code?: string;
  errno?: number | string;
  syscall?: string;
  hostname?: string;
}

export interface DnsRequest {
  operation: string;
  args: unknown[];
  resolver?: {
    options: ResolverOptions;
    servers?: string[];
    localAddress?: [string, string];
  };
}

export type DnsResponse = { ok: true; value: unknown } | { ok: false; error: DnsErrorData };

export interface DnsError extends Error {
  code?: string;
  errno?: number | string;
  syscall?: string;
  hostname?: string;
}

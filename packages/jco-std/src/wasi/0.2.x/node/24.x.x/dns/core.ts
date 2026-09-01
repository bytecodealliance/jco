/**
 * Node.js DNS compatibility facade.
 *
 * Contract adapted from nodejs/node v24.19.0 (commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae), primarily lib/dns.js,
 * lib/internal/dns/promises.js, and lib/internal/dns/utils.js (MIT license).
 * Local changes replace c-ares/native request wrappers with a typed host provider,
 * share state between callback and promise facades, and make cancellation explicit.
 */
import { dnsError, invalidArgType, invalidArgValue, unsupported } from "./errors.js";
import type {
  AnyRecord,
  CaaRecord,
  DnsAnyRecord,
  DnsError,
  DnsFamily,
  DnsHost,
  DnsHostFamily,
  DnsHostResultOrder,
  DnsResolverConfig,
  DnsResult,
  DnsResultOrder,
  LookupAddress,
  LookupAllOptions,
  LookupOneOptions,
  LookupOptions,
  MxRecord,
  NaptrRecord,
  RecordWithTtl,
  ResolveOptions,
  ResolverOptions,
  SoaRecord,
  SrvRecord,
  TlsaRecord,
} from "./types.js";

// Node exposes the platform's getaddrinfo values. Jco uses Node 24's Linux
// values in the guest ABI and the Node host translates them for its platform.
export const ADDRCONFIG = 32;
export const ALL = 16;
export const V4MAPPED = 8;
export const NODATA = "ENODATA";
export const FORMERR = "EFORMERR";
export const SERVFAIL = "ESERVFAIL";
export const NOTFOUND = "ENOTFOUND";
export const NOTIMP = "ENOTIMP";
export const REFUSED = "EREFUSED";
export const BADQUERY = "EBADQUERY";
export const BADNAME = "EBADNAME";
export const BADFAMILY = "EBADFAMILY";
export const BADRESP = "EBADRESP";
export const CONNREFUSED = "ECONNREFUSED";
export const TIMEOUT = "ETIMEOUT";
export const EOF = "EOF";
export const FILE = "EFILE";
export const NOMEM = "ENOMEM";
export const DESTRUCTION = "EDESTRUCTION";
export const BADSTR = "EBADSTR";
export const BADFLAGS = "EBADFLAGS";
export const NONAME = "ENONAME";
export const BADHINTS = "EBADHINTS";
export const NOTINITIALIZED = "ENOTINITIALIZED";
export const LOADIPHLPAPI = "ELOADIPHLPAPI";
export const ADDRGETNETWORKPARAMS = "EADDRGETNETWORKPARAMS";
export const CANCELLED = "ECANCELLED";

export type DnsCallback<T> = (error: DnsError | null, value: T) => void;
export type LookupCallback = (error: DnsError | null, address: string, family: number) => void;
export type LookupAllCallback = (error: DnsError | null, addresses: LookupAddress[]) => void;
export type LookupServiceCallback = (
  error: DnsError | null,
  hostname: string,
  service: string,
) => void;

interface ResolverConfiguration {
  options: ResolverOptions;
  servers?: string[];
  localAddress?: [string, string];
}

interface ParsedLookupOptions {
  family: DnsFamily;
  hints: number;
  all: boolean;
  order: DnsResultOrder;
}

export type ResolveResult =
  | string[]
  | AnyRecord[]
  | CaaRecord[]
  | MxRecord[]
  | NaptrRecord[]
  | SoaRecord
  | SrvRecord[]
  | TlsaRecord[]
  | string[][]
  | RecordWithTtl[];

const VALID_ORDERS = new Set<DnsResultOrder>(["ipv4first", "ipv6first", "verbatim"]);
const VALID_HINTS = ADDRCONFIG | ALL | V4MAPPED;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hostResult<T>(response: DnsResult<T>): T {
  if (response.tag === "err") {
    throw dnsError(response.val);
  }
  return response.val;
}

function hostFamily(value: DnsFamily): DnsHostFamily {
  return value === 4 ? "ipv4" : value === 6 ? "ipv6" : "unspecified";
}

function publicFamily(value: DnsHostFamily): DnsFamily {
  return value === "ipv4" ? 4 : value === "ipv6" ? 6 : 0;
}

function hostOrder(value: DnsResultOrder): DnsHostResultOrder {
  return value === "ipv4first" ? "ipv4-first" : value === "ipv6first" ? "ipv6-first" : value;
}

function hostResolver(value?: ResolverConfiguration): DnsResolverConfig | undefined {
  return value
    ? {
        options: { ...value.options },
        servers: value.servers?.slice(),
        localAddress: value.localAddress ? [...value.localAddress] : undefined,
      }
    : undefined;
}

function tlsaRecord(value: {
  certUsage: number;
  selector: number;
  match: number;
  data: Uint8Array;
}): TlsaRecord {
  const data = value.data.slice();
  return {
    certUsage: value.certUsage,
    selector: value.selector,
    match: value.match,
    data: data.buffer,
  };
}

function anyRecord(value: DnsAnyRecord): AnyRecord {
  switch (value.tag) {
    case "a":
      return { type: "A", ...value.val };
    case "aaaa":
      return { type: "AAAA", ...value.val };
    case "caa":
      return { type: "CAA", ...value.val };
    case "cname":
      return { type: "CNAME", value: value.val };
    case "mx":
      return { type: "MX", ...value.val };
    case "naptr":
      return { type: "NAPTR", ...value.val };
    case "ns":
      return { type: "NS", value: value.val };
    case "ptr":
      return { type: "PTR", value: value.val };
    case "soa":
      return { type: "SOA", ...value.val };
    case "srv":
      return { type: "SRV", ...value.val };
    case "tlsa":
      return { type: "TLSA", ...tlsaRecord(value.val) };
    case "txt":
      return { type: "TXT", entries: value.val };
  }
}

function validateString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    throw invalidArgType(name, "string");
  }
  if (value.includes("\0")) {
    throw invalidArgValue(name, value);
  }
}

function validateFunction(
  value: unknown,
  name = "callback",
): asserts value is (...args: never[]) => unknown {
  if (typeof value !== "function") {
    throw invalidArgType(name, "function");
  }
}

function familyValue(value: unknown): DnsFamily {
  if (value === "IPv4") {
    return 4;
  }
  if (value === "IPv6") {
    return 6;
  }
  if (value === undefined) {
    return 0;
  }
  if (value !== 0 && value !== 4 && value !== 6) {
    throw invalidArgValue("options.family", value);
  }
  return value;
}

function lookupOptions(
  options: number | LookupOptions | undefined,
  defaultOrder: DnsResultOrder,
): ParsedLookupOptions {
  if (typeof options === "number") {
    return { family: familyValue(options), hints: 0, all: false, order: defaultOrder };
  }
  if (options !== undefined && (typeof options !== "object" || options === null)) {
    throw invalidArgType("options", "integer or object");
  }
  const family = familyValue(options?.family);
  const hints = options?.hints ?? 0;
  if (typeof hints !== "number") {
    throw invalidArgType("options.hints", "number");
  }
  if ((hints & ~VALID_HINTS) !== 0) {
    throw invalidArgValue("options.hints", hints);
  }
  if (options?.all !== undefined && typeof options.all !== "boolean") {
    throw invalidArgType("options.all", "boolean");
  }
  if (options?.verbatim !== undefined && typeof options.verbatim !== "boolean") {
    throw invalidArgType("options.verbatim", "boolean");
  }
  const order =
    options?.order ??
    (options?.verbatim === undefined ? defaultOrder : options.verbatim ? "verbatim" : "ipv4first");
  if (!VALID_ORDERS.has(order)) {
    throw invalidArgValue("options.order", order);
  }
  return { family, hints, all: options?.all ?? false, order };
}

function isIp(value: string): DnsFamily {
  if (
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) &&
    value.split(".").every((part) => Number(part) <= 255)
  ) {
    return 4;
  }
  if (value.includes(":") && /^[0-9a-f:.]+$/i.test(value)) {
    return 6;
  }
  return 0;
}

function enqueue<T>(callback: DnsCallback<T>, response: () => T): void {
  let value: T | undefined;
  let error: DnsError | undefined;
  try {
    value = response();
  } catch (caught) {
    error = caught instanceof Error ? (caught as DnsError) : new Error(String(caught));
  }
  queueMicrotask(() => {
    if (error) {
      (callback as unknown as (error: DnsError) => void)(error);
    } else {
      callback(null, value as T);
    }
  });
}

function promiseCall<T>(response: () => T): Promise<T> {
  return new Promise((resolve, reject) =>
    queueMicrotask(() => {
      try {
        resolve(response());
      } catch (error) {
        reject(error);
      }
    }),
  );
}

function resolveArgs(hostname: unknown, callback: unknown): asserts hostname is string {
  validateString(hostname, "hostname");
  validateFunction(callback);
}

type ResolveOperation =
  | "resolve4"
  | "resolve6"
  | "resolveAny"
  | "resolveCaa"
  | "resolveCname"
  | "resolveMx"
  | "resolveNaptr"
  | "resolveNs"
  | "resolvePtr"
  | "resolveSoa"
  | "resolveSrv"
  | "resolveTlsa"
  | "resolveTxt"
  | "reverse";

function resolveOperation(rrtype: string): ResolveOperation {
  const operations: Record<string, ResolveOperation> = {
    A: "resolve4",
    AAAA: "resolve6",
    ANY: "resolveAny",
    CAA: "resolveCaa",
    CNAME: "resolveCname",
    MX: "resolveMx",
    NAPTR: "resolveNaptr",
    NS: "resolveNs",
    PTR: "resolvePtr",
    SOA: "resolveSoa",
    SRV: "resolveSrv",
    TLSA: "resolveTlsa",
    TXT: "resolveTxt",
  };
  const operation = operations[rrtype.toUpperCase()];
  if (!operation) {
    throw invalidArgValue("rrtype", rrtype);
  }
  return operation;
}

function resolveHost(
  host: DnsHost,
  operation: ResolveOperation,
  hostname: string,
  ttl: boolean,
  resolver?: ResolverConfiguration,
): ResolveResult {
  const configuration = hostResolver(resolver);
  switch (operation) {
    case "resolve4": {
      const records = hostResult(host.resolve4(hostname, ttl, configuration));
      return ttl ? records : records.map((record) => record.address);
    }
    case "resolve6": {
      const records = hostResult(host.resolve6(hostname, ttl, configuration));
      return ttl ? records : records.map((record) => record.address);
    }
    case "resolveAny":
      return hostResult(host.resolveAny(hostname, configuration)).map(anyRecord);
    case "resolveCaa":
      return hostResult(host.resolveCaa(hostname, configuration));
    case "resolveCname":
      return hostResult(host.resolveCname(hostname, configuration));
    case "resolveMx":
      return hostResult(host.resolveMx(hostname, configuration));
    case "resolveNaptr":
      return hostResult(host.resolveNaptr(hostname, configuration));
    case "resolveNs":
      return hostResult(host.resolveNs(hostname, configuration));
    case "resolvePtr":
      return hostResult(host.resolvePtr(hostname, configuration));
    case "resolveSoa":
      return hostResult(host.resolveSoa(hostname, configuration));
    case "resolveSrv":
      return hostResult(host.resolveSrv(hostname, configuration));
    case "resolveTlsa":
      return hostResult(host.resolveTlsa(hostname, configuration)).map(tlsaRecord);
    case "resolveTxt":
      return hostResult(host.resolveTxt(hostname, configuration));
    case "reverse":
      return hostResult(host.reverse(hostname, configuration));
  }
}

export interface CallbackResolver {
  cancel(): never;
  getServers(): string[];
  setServers(servers: string[]): void;
  setLocalAddress(ipv4?: string, ipv6?: string): void;
  resolve(hostname: string, callback: DnsCallback<string[]>): void;
  resolve(hostname: string, rrtype: string, callback: DnsCallback<ResolveResult>): void;
  resolve4(hostname: string, callback: DnsCallback<string[]>): void;
  resolve4(
    hostname: string,
    options: ResolveOptions,
    callback: DnsCallback<string[] | RecordWithTtl[]>,
  ): void;
  resolve6(hostname: string, callback: DnsCallback<string[]>): void;
  resolve6(
    hostname: string,
    options: ResolveOptions,
    callback: DnsCallback<string[] | RecordWithTtl[]>,
  ): void;
  resolveAny(hostname: string, callback: DnsCallback<AnyRecord[]>): void;
  resolveCaa(hostname: string, callback: DnsCallback<CaaRecord[]>): void;
  resolveCname(hostname: string, callback: DnsCallback<string[]>): void;
  resolveMx(hostname: string, callback: DnsCallback<MxRecord[]>): void;
  resolveNaptr(hostname: string, callback: DnsCallback<NaptrRecord[]>): void;
  resolveNs(hostname: string, callback: DnsCallback<string[]>): void;
  resolvePtr(hostname: string, callback: DnsCallback<string[]>): void;
  resolveSoa(hostname: string, callback: DnsCallback<SoaRecord>): void;
  resolveSrv(hostname: string, callback: DnsCallback<SrvRecord[]>): void;
  resolveTlsa(hostname: string, callback: DnsCallback<TlsaRecord[]>): void;
  resolveTxt(hostname: string, callback: DnsCallback<string[][]>): void;
  reverse(ip: string, callback: DnsCallback<string[]>): void;
}

export interface PromiseResolver {
  cancel(): never;
  getServers(): string[];
  setServers(servers: string[]): void;
  setLocalAddress(ipv4?: string, ipv6?: string): void;
  resolve(hostname: string, rrtype?: string): Promise<ResolveResult>;
  resolve4(hostname: string, options?: ResolveOptions): Promise<string[] | RecordWithTtl[]>;
  resolve6(hostname: string, options?: ResolveOptions): Promise<string[] | RecordWithTtl[]>;
  resolveAny(hostname: string): Promise<AnyRecord[]>;
  resolveCaa(hostname: string): Promise<CaaRecord[]>;
  resolveCname(hostname: string): Promise<string[]>;
  resolveMx(hostname: string): Promise<MxRecord[]>;
  resolveNaptr(hostname: string): Promise<NaptrRecord[]>;
  resolveNs(hostname: string): Promise<string[]>;
  resolvePtr(hostname: string): Promise<string[]>;
  resolveSoa(hostname: string): Promise<SoaRecord>;
  resolveSrv(hostname: string): Promise<SrvRecord[]>;
  resolveTlsa(hostname: string): Promise<TlsaRecord[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
  reverse(ip: string): Promise<string[]>;
}

export interface LookupFunction {
  (hostname: string, callback: LookupCallback): void;
  (hostname: string, family: number, callback: LookupCallback): void;
  (hostname: string, options: LookupOneOptions, callback: LookupCallback): void;
  (hostname: string, options: LookupAllOptions, callback: LookupAllCallback): void;
  (hostname: string, options: LookupOptions, callback: LookupCallback | LookupAllCallback): void;
}

export interface PromiseLookupFunction {
  (hostname: string, family?: number): Promise<LookupAddress>;
  (hostname: string, options: LookupOneOptions): Promise<LookupAddress>;
  (hostname: string, options: LookupAllOptions): Promise<LookupAddress[]>;
  (hostname: string, options: LookupOptions): Promise<LookupAddress | LookupAddress[]>;
}

export interface DnsModules {
  callback: {
    Resolver: new (options?: ResolverOptions) => CallbackResolver;
    getServers(): string[];
    setServers(servers: string[]): void;
    getDefaultResultOrder(): DnsResultOrder;
    setDefaultResultOrder(order: DnsResultOrder): void;
    lookup: LookupFunction;
    lookupService(address: string, port: number, callback: LookupServiceCallback): void;
    resolve: CallbackResolver["resolve"];
    resolve4: CallbackResolver["resolve4"];
    resolve6: CallbackResolver["resolve6"];
    resolveAny: CallbackResolver["resolveAny"];
    resolveCaa: CallbackResolver["resolveCaa"];
    resolveCname: CallbackResolver["resolveCname"];
    resolveMx: CallbackResolver["resolveMx"];
    resolveNaptr: CallbackResolver["resolveNaptr"];
    resolveNs: CallbackResolver["resolveNs"];
    resolvePtr: CallbackResolver["resolvePtr"];
    resolveSoa: CallbackResolver["resolveSoa"];
    resolveSrv: CallbackResolver["resolveSrv"];
    resolveTlsa: CallbackResolver["resolveTlsa"];
    resolveTxt: CallbackResolver["resolveTxt"];
    reverse: CallbackResolver["reverse"];
  };
  promises: {
    Resolver: new (options?: ResolverOptions) => PromiseResolver;
    getServers(): string[];
    setServers(servers: string[]): void;
    getDefaultResultOrder(): DnsResultOrder;
    setDefaultResultOrder(order: DnsResultOrder): void;
    lookup: PromiseLookupFunction;
    lookupService(address: string, port: number): Promise<{ hostname: string; service: string }>;
    resolve: PromiseResolver["resolve"];
    resolve4: PromiseResolver["resolve4"];
    resolve6: PromiseResolver["resolve6"];
    resolveAny: PromiseResolver["resolveAny"];
    resolveCaa: PromiseResolver["resolveCaa"];
    resolveCname: PromiseResolver["resolveCname"];
    resolveMx: PromiseResolver["resolveMx"];
    resolveNaptr: PromiseResolver["resolveNaptr"];
    resolveNs: PromiseResolver["resolveNs"];
    resolvePtr: PromiseResolver["resolvePtr"];
    resolveSoa: PromiseResolver["resolveSoa"];
    resolveSrv: PromiseResolver["resolveSrv"];
    resolveTlsa: PromiseResolver["resolveTlsa"];
    resolveTxt: PromiseResolver["resolveTxt"];
    reverse: PromiseResolver["reverse"];
  };
}

export function createDns(host: DnsHost): DnsModules {
  let defaultOrder: DnsResultOrder = "verbatim";
  let defaultServers: string[] | undefined;

  function servers(): string[] {
    return (defaultServers ??= hostResult(host.getServers())).slice();
  }

  function setServers(serversValue: string[]): void {
    if (!Array.isArray(serversValue)) {
      throw invalidArgType("servers", "Array");
    }
    const validated = hostResult(host.validateServers(serversValue));
    defaultServers = validated.slice();
  }

  function getDefaultResultOrder(): DnsResultOrder {
    return defaultOrder;
  }
  function setDefaultResultOrder(order: DnsResultOrder): void {
    if (!VALID_ORDERS.has(order)) {
      throw invalidArgValue("order", order);
    }
    defaultOrder = order;
  }

  function hostLookup(
    hostname: string,
    options: ParsedLookupOptions,
  ): LookupAddress | LookupAddress[] {
    const addresses = hostResult(
      host.lookup(hostname, {
        family: hostFamily(options.family),
        hints: options.hints,
        all: options.all,
        order: hostOrder(options.order),
      }),
    ).map((address) => ({
      address: address.address,
      family: publicFamily(address.family),
    }));
    if (options.all) {
      return addresses;
    }
    const address = addresses[0];
    if (!address) {
      throw new TypeError("node:dns host returned no lookup address");
    }
    return address;
  }

  class ResolverBase {
    protected readonly configuration: ResolverConfiguration;

    constructor(options: ResolverOptions = {}) {
      if (!isRecord(options)) {
        throw invalidArgType("options", "object");
      }
      for (const [name, value, minimum, maximum] of [
        ["timeout", options.timeout, -1, 0x7fffffff],
        ["tries", options.tries, 1, 0x7fffffff],
        ["maxTimeout", options.maxTimeout, 0, 0xffffffff],
      ] as const) {
        if (
          value !== undefined &&
          (typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < minimum ||
            value > maximum)
        ) {
          throw invalidArgValue(`options.${name}`, value);
        }
      }
      this.configuration = { options: { ...options } };
    }

    cancel(): never {
      return unsupported("dns.Resolver.cancel");
    }

    getServers(): string[] {
      return (this.configuration.servers ?? servers()).slice();
    }

    setServers(value: string[]): void {
      if (!Array.isArray(value)) {
        throw invalidArgType("servers", "Array");
      }
      this.configuration.servers = hostResult(host.validateServers(value));
    }

    setLocalAddress(ipv4 = "0.0.0.0", ipv6 = "::0"): void {
      validateString(ipv4, "ipv4");
      validateString(ipv6, "ipv6");
      if (isIp(ipv4) !== 4) {
        throw invalidArgValue("ipv4", ipv4);
      }
      if (isIp(ipv6) !== 6) {
        throw invalidArgValue("ipv6", ipv6);
      }
      this.configuration.localAddress = [ipv4, ipv6];
    }
  }

  class Resolver extends ResolverBase implements CallbackResolver {
    private call(
      operation: ResolveOperation,
      hostname: unknown,
      ttl: boolean,
      callback: unknown,
    ): void {
      resolveArgs(hostname, callback);
      enqueue(callback as DnsCallback<ResolveResult>, () =>
        resolveHost(host, operation, hostname, ttl, this.configuration),
      );
    }

    resolve(
      hostname: string,
      rrtypeOrCallback: string | DnsCallback<string[]>,
      callback?: DnsCallback<ResolveResult>,
    ): void {
      const rrtype = typeof rrtypeOrCallback === "string" ? rrtypeOrCallback : "A";
      this.call(
        resolveOperation(rrtype),
        hostname,
        false,
        typeof rrtypeOrCallback === "function" ? rrtypeOrCallback : callback,
      );
    }

    resolve4(
      hostname: string,
      optionsOrCallback: ResolveOptions | DnsCallback<string[]>,
      callback?: DnsCallback<string[] | RecordWithTtl[]>,
    ): void {
      const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
      this.call(
        "resolve4",
        hostname,
        options?.ttl === true,
        typeof optionsOrCallback === "function" ? optionsOrCallback : callback,
      );
    }

    resolve6(
      hostname: string,
      optionsOrCallback: ResolveOptions | DnsCallback<string[]>,
      callback?: DnsCallback<string[] | RecordWithTtl[]>,
    ): void {
      const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
      this.call(
        "resolve6",
        hostname,
        options?.ttl === true,
        typeof optionsOrCallback === "function" ? optionsOrCallback : callback,
      );
    }

    resolveAny(hostname: string, callback: DnsCallback<AnyRecord[]>): void {
      this.call("resolveAny", hostname, false, callback);
    }

    resolveCaa(hostname: string, callback: DnsCallback<CaaRecord[]>): void {
      this.call("resolveCaa", hostname, false, callback);
    }

    resolveCname(hostname: string, callback: DnsCallback<string[]>): void {
      this.call("resolveCname", hostname, false, callback);
    }

    resolveMx(hostname: string, callback: DnsCallback<MxRecord[]>): void {
      this.call("resolveMx", hostname, false, callback);
    }

    resolveNaptr(hostname: string, callback: DnsCallback<NaptrRecord[]>): void {
      this.call("resolveNaptr", hostname, false, callback);
    }

    resolveNs(hostname: string, callback: DnsCallback<string[]>): void {
      this.call("resolveNs", hostname, false, callback);
    }

    resolvePtr(hostname: string, callback: DnsCallback<string[]>): void {
      this.call("resolvePtr", hostname, false, callback);
    }

    resolveSoa(hostname: string, callback: DnsCallback<SoaRecord>): void {
      this.call("resolveSoa", hostname, false, callback);
    }

    resolveSrv(hostname: string, callback: DnsCallback<SrvRecord[]>): void {
      this.call("resolveSrv", hostname, false, callback);
    }

    resolveTlsa(hostname: string, callback: DnsCallback<TlsaRecord[]>): void {
      this.call("resolveTlsa", hostname, false, callback);
    }

    resolveTxt(hostname: string, callback: DnsCallback<string[][]>): void {
      this.call("resolveTxt", hostname, false, callback);
    }

    reverse(ip: string, callback: DnsCallback<string[]>): void {
      this.call("reverse", ip, false, callback);
    }
  }

  const PromisesResolver = class Resolver extends ResolverBase implements PromiseResolver {
    private call<T extends ResolveResult>(
      operation: ResolveOperation,
      hostname: unknown,
      ttl = false,
    ): Promise<T> {
      validateString(hostname, "hostname");
      // Each public method below fixes T to the result family selected by its operation.
      return promiseCall(
        () => resolveHost(host, operation, hostname, ttl, this.configuration) as T,
      );
    }

    resolve(hostname: string, rrtype = "A"): Promise<ResolveResult> {
      return this.call(resolveOperation(rrtype), hostname);
    }

    resolve4(hostname: string, options?: ResolveOptions): Promise<string[] | RecordWithTtl[]> {
      return this.call("resolve4", hostname, options?.ttl === true);
    }

    resolve6(hostname: string, options?: ResolveOptions): Promise<string[] | RecordWithTtl[]> {
      return this.call("resolve6", hostname, options?.ttl === true);
    }

    resolveAny(hostname: string): Promise<AnyRecord[]> {
      return this.call("resolveAny", hostname);
    }

    resolveCaa(hostname: string): Promise<CaaRecord[]> {
      return this.call("resolveCaa", hostname);
    }

    resolveCname(hostname: string): Promise<string[]> {
      return this.call("resolveCname", hostname);
    }

    resolveMx(hostname: string): Promise<MxRecord[]> {
      return this.call("resolveMx", hostname);
    }

    resolveNaptr(hostname: string): Promise<NaptrRecord[]> {
      return this.call("resolveNaptr", hostname);
    }

    resolveNs(hostname: string): Promise<string[]> {
      return this.call("resolveNs", hostname);
    }

    resolvePtr(hostname: string): Promise<string[]> {
      return this.call("resolvePtr", hostname);
    }

    resolveSoa(hostname: string): Promise<SoaRecord> {
      return this.call("resolveSoa", hostname);
    }

    resolveSrv(hostname: string): Promise<SrvRecord[]> {
      return this.call("resolveSrv", hostname);
    }

    resolveTlsa(hostname: string): Promise<TlsaRecord[]> {
      return this.call("resolveTlsa", hostname);
    }

    resolveTxt(hostname: string): Promise<string[][]> {
      return this.call("resolveTxt", hostname);
    }

    reverse(ip: string): Promise<string[]> {
      return this.call("reverse", ip);
    }
  };

  function lookup(
    hostname: string,
    optionsOrCallback: number | LookupOptions | LookupCallback | LookupAllCallback,
    callback?: LookupCallback | LookupAllCallback,
  ): object {
    validateString(hostname, "hostname");
    const actualCallback = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
    validateFunction(actualCallback);
    const options = lookupOptions(
      typeof optionsOrCallback === "function" ? undefined : optionsOrCallback,
      defaultOrder,
    );
    const literalFamily = isIp(hostname);
    if (literalFamily || !hostname) {
      queueMicrotask(() =>
        options.all
          ? (actualCallback as LookupAllCallback)(
              null,
              hostname ? [{ address: hostname, family: literalFamily }] : [],
            )
          : (actualCallback as LookupCallback)(
              null,
              hostname || (null as unknown as string),
              literalFamily || (options.family === 6 ? 6 : 4),
            ),
      );
      return {};
    }
    let result: LookupAddress | LookupAddress[] | undefined;
    let error: DnsError | undefined;
    try {
      result = hostLookup(hostname, options);
    } catch (caught) {
      error = caught instanceof Error ? (caught as DnsError) : new Error(String(caught));
    }
    queueMicrotask(() => {
      if (error) {
        (actualCallback as unknown as (error: DnsError) => void)(error);
      } else if (options.all) {
        (actualCallback as LookupAllCallback)(null, result as LookupAddress[]);
      } else {
        const address = result as LookupAddress;
        (actualCallback as LookupCallback)(null, address.address, address.family);
      }
    });
    return {};
  }

  function lookupService(address: string, port: number, callback: LookupServiceCallback): object {
    validateString(address, "address");
    if (isIp(address) === 0) {
      throw invalidArgValue("address", address);
    }
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort < 0 || numericPort > 65535) {
      throw invalidArgValue("port", port);
    }
    validateFunction(callback);
    let result: { hostname: string; service: string } | undefined;
    let error: DnsError | undefined;
    try {
      result = hostResult(host.lookupService(address, numericPort));
    } catch (caught) {
      error = caught instanceof Error ? (caught as DnsError) : new Error(String(caught));
    }
    queueMicrotask(() => {
      if (error) {
        (callback as unknown as (error: DnsError) => void)(error);
      } else {
        callback(null, result?.hostname as string, result?.service as string);
      }
    });
    return {};
  }

  const defaultResolver = new Resolver();
  const promiseResolver = new PromisesResolver();
  const callback: DnsModules["callback"] = {
    Resolver,
    getServers: servers,
    setServers,
    getDefaultResultOrder,
    setDefaultResultOrder,
    lookup: lookup as LookupFunction,
    lookupService,
    resolve: defaultResolver.resolve.bind(defaultResolver),
    resolve4: defaultResolver.resolve4.bind(defaultResolver),
    resolve6: defaultResolver.resolve6.bind(defaultResolver),
    resolveAny: defaultResolver.resolveAny.bind(defaultResolver),
    resolveCaa: defaultResolver.resolveCaa.bind(defaultResolver),
    resolveCname: defaultResolver.resolveCname.bind(defaultResolver),
    resolveMx: defaultResolver.resolveMx.bind(defaultResolver),
    resolveNaptr: defaultResolver.resolveNaptr.bind(defaultResolver),
    resolveNs: defaultResolver.resolveNs.bind(defaultResolver),
    resolvePtr: defaultResolver.resolvePtr.bind(defaultResolver),
    resolveSoa: defaultResolver.resolveSoa.bind(defaultResolver),
    resolveSrv: defaultResolver.resolveSrv.bind(defaultResolver),
    resolveTlsa: defaultResolver.resolveTlsa.bind(defaultResolver),
    resolveTxt: defaultResolver.resolveTxt.bind(defaultResolver),
    reverse: defaultResolver.reverse.bind(defaultResolver),
  };

  const promises: DnsModules["promises"] = {
    Resolver: PromisesResolver,
    getServers: servers,
    setServers,
    getDefaultResultOrder,
    setDefaultResultOrder,
    lookup: function lookup(
      hostname: string,
      options?: number | LookupOptions,
    ): Promise<LookupAddress | LookupAddress[]> {
      validateString(hostname, "hostname");
      const parsed = lookupOptions(options, defaultOrder);
      const family = isIp(hostname);
      if (family) {
        return Promise.resolve(
          parsed.all ? [{ address: hostname, family }] : { address: hostname, family },
        );
      }
      return promiseCall(() => hostLookup(hostname, parsed));
    } as PromiseLookupFunction,
    lookupService(address: string, port: number): Promise<{ hostname: string; service: string }> {
      validateString(address, "address");
      if (isIp(address) === 0) {
        throw invalidArgValue("address", address);
      }
      const numericPort = Number(port);
      if (!Number.isInteger(numericPort) || numericPort < 0 || numericPort > 65535) {
        throw invalidArgValue("port", port);
      }
      return promiseCall(() => hostResult(host.lookupService(address, numericPort)));
    },
    resolve: promiseResolver.resolve.bind(promiseResolver),
    resolve4: promiseResolver.resolve4.bind(promiseResolver),
    resolve6: promiseResolver.resolve6.bind(promiseResolver),
    resolveAny: promiseResolver.resolveAny.bind(promiseResolver),
    resolveCaa: promiseResolver.resolveCaa.bind(promiseResolver),
    resolveCname: promiseResolver.resolveCname.bind(promiseResolver),
    resolveMx: promiseResolver.resolveMx.bind(promiseResolver),
    resolveNaptr: promiseResolver.resolveNaptr.bind(promiseResolver),
    resolveNs: promiseResolver.resolveNs.bind(promiseResolver),
    resolvePtr: promiseResolver.resolvePtr.bind(promiseResolver),
    resolveSoa: promiseResolver.resolveSoa.bind(promiseResolver),
    resolveSrv: promiseResolver.resolveSrv.bind(promiseResolver),
    resolveTlsa: promiseResolver.resolveTlsa.bind(promiseResolver),
    resolveTxt: promiseResolver.resolveTxt.bind(promiseResolver),
    reverse: promiseResolver.reverse.bind(promiseResolver),
  };

  return { callback, promises };
}

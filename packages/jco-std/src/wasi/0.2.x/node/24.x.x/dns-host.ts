import type { DnsHost } from "./dns/types.js";
import { adapterRequiredMessage, denyThrow } from "./internal/deny-host.js";

/**
 * The default adapter intentionally grants no name-resolution capability. Applications must map
 * `jco:node/dns@0.1.0` to a host implementation, such as the separately exported Node adapter.
 */
const deny = denyThrow("ERR_JCO_DNS_ADAPTER_REQUIRED", adapterRequiredMessage("node:dns"));

export const getServers: DnsHost["getServers"] = deny;

export const validateServers: DnsHost["validateServers"] = deny;

export const lookup: DnsHost["lookup"] = deny;

export const lookupService: DnsHost["lookupService"] = deny;

export const resolve4: DnsHost["resolve4"] = deny;

export const resolve6: DnsHost["resolve6"] = deny;

export const resolveAny: DnsHost["resolveAny"] = deny;

export const resolveCaa: DnsHost["resolveCaa"] = deny;

export const resolveCname: DnsHost["resolveCname"] = deny;

export const resolveMx: DnsHost["resolveMx"] = deny;

export const resolveNaptr: DnsHost["resolveNaptr"] = deny;

export const resolveNs: DnsHost["resolveNs"] = deny;

export const resolvePtr: DnsHost["resolvePtr"] = deny;

export const resolveSoa: DnsHost["resolveSoa"] = deny;

export const resolveSrv: DnsHost["resolveSrv"] = deny;

export const resolveTlsa: DnsHost["resolveTlsa"] = deny;

export const resolveTxt: DnsHost["resolveTxt"] = deny;

export const reverse: DnsHost["reverse"] = deny;

const host: DnsHost = {
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

import {
  ADDRGETNETWORKPARAMS,
  BADFAMILY,
  BADFLAGS,
  BADHINTS,
  BADNAME,
  BADQUERY,
  BADRESP,
  BADSTR,
  CANCELLED,
  CONNREFUSED,
  DESTRUCTION,
  EOF,
  FILE,
  FORMERR,
  LOADIPHLPAPI,
  NODATA,
  NOMEM,
  NONAME,
  NOTFOUND,
  NOTIMP,
  NOTINITIALIZED,
  REFUSED,
  SERVFAIL,
  TIMEOUT,
} from "./dns/core.js";
import { dns } from "./dns-runtime.js";

export type * from "./dns/types.js";
export {
  ADDRGETNETWORKPARAMS,
  BADFAMILY,
  BADFLAGS,
  BADHINTS,
  BADNAME,
  BADQUERY,
  BADRESP,
  BADSTR,
  CANCELLED,
  CONNREFUSED,
  DESTRUCTION,
  EOF,
  FILE,
  FORMERR,
  LOADIPHLPAPI,
  NODATA,
  NOMEM,
  NONAME,
  NOTFOUND,
  NOTIMP,
  NOTINITIALIZED,
  REFUSED,
  SERVFAIL,
  TIMEOUT,
};

export const Resolver = dns.promises.Resolver;
export const getDefaultResultOrder = dns.promises.getDefaultResultOrder;
export const getServers = dns.promises.getServers;
export const lookup = dns.promises.lookup;
export const lookupService = dns.promises.lookupService;
export const resolve = dns.promises.resolve;
export const resolve4 = dns.promises.resolve4;
export const resolve6 = dns.promises.resolve6;
export const resolveAny = dns.promises.resolveAny;
export const resolveCaa = dns.promises.resolveCaa;
export const resolveCname = dns.promises.resolveCname;
export const resolveMx = dns.promises.resolveMx;
export const resolveNaptr = dns.promises.resolveNaptr;
export const resolveNs = dns.promises.resolveNs;
export const resolvePtr = dns.promises.resolvePtr;
export const resolveSoa = dns.promises.resolveSoa;
export const resolveSrv = dns.promises.resolveSrv;
export const resolveTlsa = dns.promises.resolveTlsa;
export const resolveTxt = dns.promises.resolveTxt;
export const reverse = dns.promises.reverse;
export const setDefaultResultOrder = dns.promises.setDefaultResultOrder;
export const setServers = dns.promises.setServers;

export default Object.assign(dns.promises, {
  ADDRGETNETWORKPARAMS,
  BADFAMILY,
  BADFLAGS,
  BADHINTS,
  BADNAME,
  BADQUERY,
  BADRESP,
  BADSTR,
  CANCELLED,
  CONNREFUSED,
  DESTRUCTION,
  EOF,
  FILE,
  FORMERR,
  LOADIPHLPAPI,
  NODATA,
  NOMEM,
  NONAME,
  NOTFOUND,
  NOTIMP,
  NOTINITIALIZED,
  REFUSED,
  SERVFAIL,
  TIMEOUT,
});

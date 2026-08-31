import {
  ADDRCONFIG,
  ADDRGETNETWORKPARAMS,
  ALL,
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
  V4MAPPED,
} from "./dns/core.js";
import { dns } from "./dns-runtime.js";

export type * from "./dns/types.js";

export {
  ADDRCONFIG,
  ADDRGETNETWORKPARAMS,
  ALL,
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
  V4MAPPED,
};

export const Resolver = dns.callback.Resolver;
export const getDefaultResultOrder = dns.callback.getDefaultResultOrder;
export const getServers = dns.callback.getServers;
export const lookup = dns.callback.lookup;
export const lookupService = dns.callback.lookupService;
export const promises = Object.assign(dns.promises, {
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
export const resolve = dns.callback.resolve;
export const resolve4 = dns.callback.resolve4;
export const resolve6 = dns.callback.resolve6;
export const resolveAny = dns.callback.resolveAny;
export const resolveCaa = dns.callback.resolveCaa;
export const resolveCname = dns.callback.resolveCname;
export const resolveMx = dns.callback.resolveMx;
export const resolveNaptr = dns.callback.resolveNaptr;
export const resolveNs = dns.callback.resolveNs;
export const resolvePtr = dns.callback.resolvePtr;
export const resolveSoa = dns.callback.resolveSoa;
export const resolveSrv = dns.callback.resolveSrv;
export const resolveTlsa = dns.callback.resolveTlsa;
export const resolveTxt = dns.callback.resolveTxt;
export const reverse = dns.callback.reverse;
export const setDefaultResultOrder = dns.callback.setDefaultResultOrder;
export const setServers = dns.callback.setServers;

export default {
  ADDRCONFIG,
  ADDRGETNETWORKPARAMS,
  ALL,
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
  Resolver,
  SERVFAIL,
  TIMEOUT,
  V4MAPPED,
  getDefaultResultOrder,
  getServers,
  lookup,
  lookupService,
  promises,
  resolve,
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
  setDefaultResultOrder,
  setServers,
};

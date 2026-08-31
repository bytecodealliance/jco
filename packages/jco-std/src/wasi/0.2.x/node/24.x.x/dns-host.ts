import type { DnsHost } from "./dns/types.js";

/** DNS is denied unless an application explicitly selects a host provider. */
export const query: DnsHost["query"] = () => {
  const error = new Error("node:dns requires an application-provided host adapter");
  Object.assign(error, { code: "ERR_JCO_DNS_ADAPTER_REQUIRED" });
  throw error;
};

export default { query };

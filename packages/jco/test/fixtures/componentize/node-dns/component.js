import dns, * as dnsNamespace from "node:dns";
import dnsPromises from "node:dns/promises";

export function run() {
    dns.setDefaultResultOrder("ipv4first");
    const servers = dns.getServers();
    let cancelCode = "";
    try {
        new dns.Resolver().cancel();
    } catch (error) {
        cancelCode = error.code;
    }
    return {
        serverCount: servers.length,
        namespaceIdentity: dns === dnsNamespace.default,
        promisesIdentity: dns.promises === dnsPromises,
        resultOrder: dnsPromises.getDefaultResultOrder(),
        cancelCode,
    };
}

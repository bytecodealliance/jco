import dns, * as dnsNamespace from "node:dns";
import dnsPromises from "node:dns/promises";

export async function run() {
    dns.setDefaultResultOrder("ipv4first");
    const servers = dns.getServers();
    const externalAddresses = await dnsPromises.resolve4("example.com");
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
        externalAddressCount: externalAddresses.length,
        externalAddressesAreIpv4: externalAddresses.every((address) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)),
    };
}

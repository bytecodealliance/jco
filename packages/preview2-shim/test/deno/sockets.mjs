import { checkTcpAddresses } from "../fixtures/sockets/address-families.mjs";

for (const family of ["ipv4", "ipv6"]) {
    Deno.test(`TCP worker addresses (${family})`, () => checkTcpAddresses(family));
}

// UDP round trips run in the Node suite: Deno 1 does not implement setTTL,
// which the shim needs to finish binding a UDP socket.

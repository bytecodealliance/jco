import { starReexportAdapter, type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { DNS_PROMISES_WIT_REQUIREMENT, DNS_WIT_REQUIREMENT } from "../node-wit.js";

const DNS_SPECIFIERS = new Set(["node:dns", "node:dns/promises"]);

function dnsAdapter(dnsModule: string): string {
    return starReexportAdapter(dnsModule, "dns");
}

export function createDnsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        DNS_SPECIFIERS,
        (specifier) =>
            dnsAdapter(
                specifier === "node:dns/promises"
                    ? stdModule(options.dnsPromisesModule, "dns/promises")
                    : stdModule(options.dnsModule, "dns"),
            ),
        (specifier) =>
            options.onWitRequirement?.(
                specifier === "node:dns/promises" ? DNS_PROMISES_WIT_REQUIREMENT : DNS_WIT_REQUIREMENT,
            ),
    );
}

import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const DOMAIN_SPECIFIER = "node:domain";

/**
 * Source of the `node:domain` adapter.
 *
 * Resolves so the failure can explain itself: `node:domain` is deprecated upstream and every use
 * throws. Leaving it unresolved would fail the build with an unrelated-sounding message.
 */
function domainAdapter(domainModule: string): string {
    return `
import domain from ${JSON.stringify(domainModule)};
export default domain;
export { Domain, create, createDomain } from ${JSON.stringify(domainModule)};
`;
}

export function createDomainBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(DOMAIN_SPECIFIER, () => domainAdapter(stdModule(options.domainModule, "domain")));
}

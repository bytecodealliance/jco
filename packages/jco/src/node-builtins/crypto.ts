import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule, starReexportAdapter } from "./shared.js";
import { RANDOM_WIT_REQUIREMENT, CRYPTO_KDF_WIT_REQUIREMENT } from "../node-wit.js";

export function createCryptoBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        "node:crypto",
        () =>
            (options.nodejsCryptoVia === "direct"
                ? `import * as kdfHost from "jco:node/crypto-kdf@0.1.0";
import { setDerivationHost } from ${JSON.stringify(stdModule(undefined, "crypto/kdf-host"))};
setDerivationHost(kdfHost);
`
                : "") +
            (options.hostTaskTimers
                ? `
import { getRandomBytes } from "wasi:random/random@0.2.12";
import { createRandomCrypto } from ${JSON.stringify(stdModule(undefined, "crypto/random"))};
globalThis.crypto ??= createRandomCrypto(length => getRandomBytes(Number(length)));
`
                : "") +
            starReexportAdapter(stdModule(options.cryptoModule, "crypto"), "implementation"),
        () => {
            if (options.hostTaskTimers) {
                options.onWitRequirement?.(RANDOM_WIT_REQUIREMENT);
            }
            if (options.nodejsCryptoVia === "direct") {
                options.onWitRequirement?.(CRYPTO_KDF_WIT_REQUIREMENT);
            }
        },
    );
}

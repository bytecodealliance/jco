import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule, starReexportAdapter } from "./shared.js";

export function createCryptoBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin("node:crypto", () =>
        starReexportAdapter(stdModule(options.cryptoModule, "crypto"), "implementation"),
    );
}

import { type NodeBuiltinOptions } from "./types.js";
import { unenvModule } from "./unenv.js";
import { UNENV_BUFFER_CORE } from "./buffer.js";
import { type BuiltinContext, type BuiltinAdapter, builtin } from "./shared.js";

function querystringAdapter(options: NodeBuiltinOptions): string {
    const querystringModule = unenvModule("node:querystring", options);
    return `
import ${JSON.stringify(UNENV_BUFFER_CORE)};
import querystring from ${JSON.stringify(querystringModule)};
export * from ${JSON.stringify(querystringModule)};
export default querystring;
`;
}

export function createQuerystringBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        "node:querystring",
        () => querystringAdapter(options),
        () => {
            querystringAdapter(options);
        },
    );
}

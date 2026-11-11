import { typegenOptions, type TypegenOptions } from "./typegen-options.js";

import {
    $init,
    generate as _generate,
    generateTypes as _generateTypes,
} from "@bytecodealliance/jco-transpile/component";

/** Generate bindings while preserving Jco's declaration compatibility defaults. */
export async function generate(
    component: Parameters<typeof _generate>[0],
    options: Parameters<typeof _generate>[1] & TypegenOptions,
) {
    return callBindgen(() => _generate(component, { ...options, ...typegenOptions(options) }));
}

/** Generate declarations with options supported independently of the installed backend version. */
export async function generateTypes(
    name: Parameters<typeof _generateTypes>[0],
    options: Parameters<typeof _generateTypes>[1] & TypegenOptions,
) {
    return callBindgen(() => _generateTypes(name, { ...options, ...typegenOptions(options) }));
}

async function callBindgen<T>(run: () => T): Promise<T> {
    for (;;) {
        const init = $init;
        await init;
        if (init === $init) {
            return run();
        }
    }
}

// for backwards compat
export { generate as transpile };

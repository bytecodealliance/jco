import {
    $init,
    generate as _generate,
    generateTypes as _generateTypes,
} from "@bytecodealliance/jco-transpile/component";

export async function generate(...args: Parameters<typeof _generate>) {
    return callBindgen(() => _generate(...args));
}

export async function generateTypes(...args: Parameters<typeof _generateTypes>) {
    return callBindgen(() => _generateTypes(...args));
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

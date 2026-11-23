// Run the CLI against the workspace jco-transpile so pending changes to either
// package participate in the comparison before the packages are released.
import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const transpileDist = new URL('../../../packages/jco-transpile/dist/', import.meta.url);

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === '@bytecodealliance/jco-transpile') {
            return { url: new URL('index.js', transpileDist).href, shortCircuit: true };
        }
        if (context.parentURL === new URL('transpile.js', transpileDist).href && specifier === './component.js') {
            return { url: import.meta.url, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});

/** Run the call to generate with the CLI's prepared component options. */
export function callBindgen(run) {
    return run();
}

/** Send the arguments at the Wasm boundary to the native parity test. */
export function generate(_component, options) {
    writeFileSync(1, JSON.stringify(options));
    process.exit(0);
}

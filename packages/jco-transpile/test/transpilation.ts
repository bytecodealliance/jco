import { env } from 'node:process';

import { transpile as transpileFile, transpileBytes as transpileBuffer } from '../src/transpile.js';
import type { TranspilationOptions } from '../src/transpile.js';

export * from '../src/index.js';

if (env.JCO_TEST_RUNTIME && !['inline', 'external'].includes(env.JCO_TEST_RUNTIME)) {
    throw new Error(`unknown JCO_TEST_RUNTIME: ${env.JCO_TEST_RUNTIME}`);
}

export const externalRuntime = env.JCO_TEST_RUNTIME === 'external';
export const defaultRuntimeUrl = new URL('../../jco-cm-runtime/dist/', import.meta.url);

/**
 * Apply the suite's runtime mode without changing production defaults.
 * An explicit cmRuntimeEsModule (including undefined for inline-only codegen
 * assertions) takes precedence. File URLs also work in isolated temporary dirs.
 */
export function runtimeOptions(options: TranspilationOptions = {}): TranspilationOptions {
    return {
        ...(externalRuntime ? { cmRuntimeEsModule: defaultRuntimeUrl.href } : {}),
        ...options,
    };
}

export function transpile(...[path, options]: Parameters<typeof transpileFile>) {
    return transpileFile(path, runtimeOptions(options));
}

export function transpileBytes(...[bytes, options]: Parameters<typeof transpileBuffer>) {
    return transpileBuffer(bytes, runtimeOptions(options));
}

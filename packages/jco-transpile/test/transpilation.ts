import { env } from 'node:process';

import { transpile as transpileFile, transpileBytes as transpileBuffer } from '../src/transpile.js';
import type { TranspilationOptions } from '../src/transpile.js';
import { selectRuntime } from './runtime-mode.mjs';

export * from '../src/index.js';

/** The workspace runtime, which `JCO_TEST_RUNTIME=external` selects. */
export const defaultRuntimeUrl = new URL('../../jco-cm-runtime/dist/', import.meta.url);

const selected: { mode: string; base: string | undefined } = selectRuntime(env, defaultRuntimeUrl);

/** The suite's runtime mode: `inline`, `external` or `custom`. */
export const runtimeMode = selected.mode;
/** The module base generated bindings import the runtime from; undefined when inline. */
export const runtimeBase = selected.base;
/** Whether generated bindings import a runtime, the workspace's or a custom one. */
export const externalRuntime = runtimeBase !== undefined;

/**
 * Apply the suite's runtime mode without changing production defaults.
 * An explicit cmRuntimeEsModule (including undefined for inline-only codegen
 * assertions) takes precedence. The selected base also resolves from isolated
 * temporary dirs.
 */
export function runtimeOptions(options: TranspilationOptions = {}): TranspilationOptions {
    return {
        ...(runtimeBase === undefined ? {} : { cmRuntimeEsModule: runtimeBase }),
        ...options,
    };
}

export function transpile(...[path, options]: Parameters<typeof transpileFile>) {
    return transpileFile(path, runtimeOptions(options));
}

export function transpileBytes(...[bytes, options]: Parameters<typeof transpileBuffer>) {
    return transpileBuffer(bytes, runtimeOptions(options));
}

import { env } from 'node:process';

import { transpile as transpileFile, transpileBytes as transpileBuffer } from '../src/transpile.js';
import type { TranspilationOptions } from '../src/transpile.js';
import { selectRuntime } from './runtime-mode.mjs';

export * from '../src/index.js';

/** The workspace runtime, which `JCO_TEST_RUNTIME=external` selects. */
export const defaultRuntimeUrl = new URL('../../jco-cm-runtime/dist/', import.meta.url);

/**
 * A runtime base for tests that assert on the text of generated bindings.
 * Bindings that import their runtime are emitted exactly as generated, whereas
 * bundling the runtime in reprints them.
 */
export const unlinkedRuntimeBase = defaultRuntimeUrl.href;

const selected: { mode: string; base: string | undefined } = selectRuntime(env, defaultRuntimeUrl);

/** The suite's runtime mode: `inline`, `external` or `custom`. */
export const runtimeMode = selected.mode;
/** The module base generated bindings import the runtime from; undefined when inline. */
export const runtimeBase = selected.base;
/** Whether generated bindings import a runtime, the workspace's or a custom one. */
export const externalRuntime = runtimeBase !== undefined;

/**
 * Whether `JCO_TEST_PERF_SYNC_FAST_PATH` (`1` or `true`) asks suites to transpile
 * with `perfSyncFastPath`, which must not change what any test observes.
 */
export const forceSyncFastPath = ['1', 'true'].includes(env.JCO_TEST_PERF_SYNC_FAST_PATH ?? '');

/**
 * Apply the suite's runtime mode without changing production defaults.
 * An explicit cmRuntimeEsModule (including undefined for bundled-runtime codegen
 * assertions) takes precedence. The selected base also resolves from isolated
 * temporary dirs.
 */
export function runtimeOptions(options: TranspilationOptions = {}): TranspilationOptions {
    return {
        ...(runtimeBase === undefined ? {} : { cmRuntimeEsModule: runtimeBase }),
        ...(forceSyncFastPath ? { perfSyncFastPath: true } : {}),
        // The workspace URL points to our checked provider. Explicit overrides may
        // point to a minimal API-v1 provider, so preserve its advertised capabilities.
        ...(runtimeMode === 'external' && !('cmRuntimeEsModule' in options) ? { cmRuntimeSyncImports: true } : {}),
        ...options,
    };
}

export function transpile(...[path, options]: Parameters<typeof transpileFile>) {
    return transpileFile(path, runtimeOptions(options));
}

export function transpileBytes(...[bytes, options]: Parameters<typeof transpileBuffer>) {
    return transpileBuffer(bytes, runtimeOptions(options));
}

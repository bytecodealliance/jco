import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { cwd } from 'node:process';
import { pathToFileURL } from 'node:url';

/** Runtime modes a test suite can run generated bindings against. */
export const RUNTIME_MODES = ['inline', 'external', 'custom'];

/** Names the module base of the runtime used by `JCO_TEST_RUNTIME=custom`. */
export const CUSTOM_BASE_VARIABLE = 'JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE';

const directoryUrl = (path) => pathToFileURL(resolve(path) + '/').href;

/**
 * Resolve a custom runtime base to one that generated modules can import from
 * any output directory, including temporary ones:
 * - a URL is used as given;
 * - a path is resolved against the working directory;
 * - a package name is resolved from the working directory to the directory
 *   holding its `runtime` module, which must lay out `intrinsics/*` beside it.
 */
export function resolveCustomRuntimeBase(base) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) {
        return base;
    }
    if (base.startsWith('.') || isAbsolute(base)) {
        return directoryUrl(base);
    }
    try {
        const require = createRequire(pathToFileURL(resolve(cwd(), 'package.json')));
        return directoryUrl(dirname(require.resolve(`${base}/runtime`)));
    } catch (cause) {
        throw new Error(
            `could not resolve the "runtime" module of package "${base}" named by ${CUSTOM_BASE_VARIABLE}; install it or pass a directory or URL`,
            { cause },
        );
    }
}

/**
 * Select the runtime a suite runs against from `JCO_TEST_RUNTIME`:
 * - `inline` (the default) bundles the transpiler's own runtime into generated bindings;
 * - `external` imports them from the workspace runtime at `localRuntimeUrl`;
 * - `custom` imports them from the base named by `JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE`.
 */
export function selectRuntime(env, localRuntimeUrl) {
    const mode = env.JCO_TEST_RUNTIME || 'inline';
    if (!RUNTIME_MODES.includes(mode)) {
        throw new Error(`unknown JCO_TEST_RUNTIME: ${mode} (expected one of ${RUNTIME_MODES.join(', ')})`);
    }
    if (mode === 'inline') {
        return { mode, base: undefined };
    }
    if (mode === 'external') {
        return { mode, base: localRuntimeUrl.href };
    }
    const custom = env[CUSTOM_BASE_VARIABLE];
    if (!custom) {
        throw new Error(`JCO_TEST_RUNTIME=custom requires ${CUSTOM_BASE_VARIABLE}`);
    }
    return { mode, base: resolveCustomRuntimeBase(custom) };
}

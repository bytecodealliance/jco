import { createResourceIntrinsics } from './intrinsics/resource.js';
import {
    RUNTIME_ABI_VERSION,
    type ComponentModelRuntime,
    type ComponentModelRuntimeProvider,
    type RuntimeOptions,
    type RuntimePlatform,
} from './types.js';

function defaultPlatform(): RuntimePlatform {
    return {
        WebAssembly: globalThis.WebAssembly,
    };
}

function createRuntime(options: RuntimeOptions): ComponentModelRuntime {
    if (options.requestedAbiVersion !== RUNTIME_ABI_VERSION) {
        throw new Error(
            `incompatible Jco Component Model runtime ABI: requested ${options.requestedAbiVersion}, ` +
                `supported ${RUNTIME_ABI_VERSION}`,
        );
    }

    const defaults = defaultPlatform();
    const platform: RuntimePlatform = {
        WebAssembly: options.platform?.WebAssembly ?? defaults.WebAssembly,
    };

    if (typeof platform.WebAssembly?.RuntimeError !== 'function') {
        throw new TypeError('Jco Component Model runtime requires WebAssembly.RuntimeError');
    }

    return {
        abiVersion: RUNTIME_ABI_VERSION,
        intrinsics: {
            resource: createResourceIntrinsics(platform.WebAssembly.RuntimeError),
        },
    };
}

export const runtime = {
    abiVersion: RUNTIME_ABI_VERSION,
    create: createRuntime,
} satisfies ComponentModelRuntimeProvider;

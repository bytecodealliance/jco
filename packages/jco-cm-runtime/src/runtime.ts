import { createResourceIntrinsics } from './intrinsics/resource.js';
import {
    CM_RUNTIME_API_VERSION,
    type ComponentModelRuntime,
    type ComponentModelRuntimeProvider,
    type RuntimeOptions,
    type RuntimePlatform,
} from './types.js';

function createRuntime(options: RuntimeOptions): ComponentModelRuntime {
    if (options.requestedApiVersion !== CM_RUNTIME_API_VERSION) {
        throw new Error(
            `incompatible Jco JavaScript Component Model runtime API: requested ${options.requestedApiVersion}, ` +
                `supported ${CM_RUNTIME_API_VERSION}`,
        );
    }

    const platform: RuntimePlatform = {
        WebAssembly: options.platform?.WebAssembly ?? globalThis.WebAssembly,
    };

    if (typeof platform.WebAssembly?.RuntimeError !== 'function') {
        throw new TypeError('Jco Component Model runtime requires WebAssembly.RuntimeError');
    }

    return {
        apiVersion: CM_RUNTIME_API_VERSION,
        intrinsics: {
            resource: createResourceIntrinsics(platform.WebAssembly.RuntimeError),
        },
    };
}

export const runtime = {
    apiVersion: CM_RUNTIME_API_VERSION,
    create: createRuntime,
} satisfies ComponentModelRuntimeProvider;

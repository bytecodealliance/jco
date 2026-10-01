import { join } from 'node:path';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../../helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../../common.js';

/** Wait for a promise, failing the test rather than hanging if it never settles */
export function withTimeout<T>(promise: Promise<T>, what: string, timeoutMs = 2_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), timeoutMs);
        }),
    ]).finally(() => clearTimeout(timer));
}

/**
 * Build a host-provided promise that only settles when disposed (or resolved via `resolve`),
 * recording each disposal.
 *
 * `onDispose` receives the promise resolvers so tests can model providers that fulfill,
 * reject or throw while handling disposal.
 */
export function disposablePending<T>(
    disposeSymbol: symbol,
    onDispose: (resolvers: PromiseWithResolvers<T>) => unknown = () => {},
) {
    const resolvers = Promise.withResolvers<T>();
    const disposed = Promise.withResolvers<void>();
    let disposeCount = 0;
    const promise = Object.assign(resolvers.promise, {
        [disposeSymbol]() {
            disposeCount++;
            disposed.resolve();
            return onDispose(resolvers);
        },
    });
    return {
        promise,
        resolve: resolvers.resolve,
        disposed: disposed.promise,
        disposeCount: () => disposeCount,
    };
}

/**
 * Collect unhandled rejections while `fn` runs
 *
 * The listener is process-wide, so concurrent tests may observe each other's unhandled
 * rejections, which are failures regardless of which test caused them.
 */
export async function collectUnhandledRejections(fn: () => Promise<void>): Promise<unknown[]> {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
        await fn();
        // Let any late settlement propagate before checking
        await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
    return unhandled;
}

/** Host implementation of `jco:test-components/host-value-disposal-host` */
export interface HostValueDisposalHost {
    pending?: (n: number) => unknown;
    getFuture?: () => unknown;
    getStream?: () => unknown;
}

/**
 * Instantiate the `host-value-disposal` test component, which cancels or discards
 * host-provided async values before receiving them
 */
export async function setupHostValueDisposal(host: HostValueDisposalHost) {
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            path: join(LOCAL_TEST_COMPONENTS_DIR, 'host-value-disposal.wasm'),
            imports: {
                ...new WASIShim().getImportObject(),
                'jco:test-components/host-value-disposal-host': {
                    pending: host.pending ?? (() => new Promise(() => {})),
                    getFuture: host.getFuture ?? (() => new Promise(() => {})),
                    getStream: host.getStream ?? (() => [][Symbol.iterator]()),
                },
            },
        },
    });
    return { guest: instance['jco:test-components/host-value-disposal-guest'], cleanup };
}

/**
 * Drive an already transpiled asynchronous component with JSPI, checking that the
 * event loop keeps running while the guest is suspended.
 *
 * @param {string} modulePath - URL of the transpiled component's JS, resolved against the current page
 * @returns {Promise<{ responseText: string }>}
 */
export async function jspi(modulePath) {
    const module = await import(modulePath);
    const instance = await module.instantiate(undefined, {
        'something:test/test-interface': {
            callAsync: () => new Promise((resolve) => setTimeout(() => resolve('callAsync'), 50)),
            callSync: () => 'callSync',
        },
    });

    const AsyncFunction = (async () => {}).constructor;
    if (instance.runSync instanceof AsyncFunction) {
        throw new Error('runSync() should be a sync function');
    }
    if (!(instance.runAsync instanceof AsyncFunction)) {
        throw new Error('runAsync() should be an async function');
    }
    if (instance.runSync() !== 'callSync') {
        throw new Error('runSync() did not return the synchronous import result');
    }

    // One queued timer proves that JSPI yielded without depending on how many
    // interval callbacks a loaded CI runner happens to schedule in 50 ms.
    let eventLoopProgressed = false;
    const eventLoopProbe = setTimeout(() => {
        eventLoopProgressed = true;
    }, 0);
    try {
        const responseText = await instance.runAsync();
        if (!eventLoopProgressed) {
            throw new Error('event loop did not progress during JSPI call');
        }
        return { responseText };
    } finally {
        clearTimeout(eventLoopProbe);
    }
}

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

    let ticks = 0;
    const interval = setInterval(() => ticks++, 5);
    try {
        const responseText = await instance.runAsync();
        if (ticks < 2) {
            throw new Error(`event loop was blocked during JSPI call; observed only ${ticks} ticks`);
        }
        return { responseText };
    } finally {
        clearInterval(interval);
    }
}

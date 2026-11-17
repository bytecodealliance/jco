/**
 * Run `callback` on the next macrotask, after the current microtasks have drained, as
 * `setTimeout(callback, 0)` would, but without its minimum delay: Node.js clamps it to 1 ms and
 * browsers to 4 ms once timers nest, which a guest that yields often pays on every yield.
 * Returns a function that cancels the callback.
 */
export function onNextMacrotask(callback: () => void): () => void {
    if (typeof setImmediate === 'function') {
        const handle = setImmediate(callback);
        return () => clearImmediate(handle);
    }
    if (typeof MessageChannel === 'function') {
        const channel = new MessageChannel();
        let cancelled = false;
        channel.port1.onmessage = () => {
            channel.port1.close();
            if (!cancelled) {
                callback();
            }
        };
        channel.port2.postMessage(null);
        return () => {
            cancelled = true;
            channel.port1.close();
        };
    }
    const handle = setTimeout(callback, 0);
    return () => clearTimeout(handle);
}

/** Yield a bounded batch of ready work to other host tasks. */
export function yieldToHost(): Promise<void> {
    return new Promise((resolve) => {
        onNextMacrotask(resolve);
    });
}

let idleChannel: MessageChannel | undefined;

/**
 * Run `callback` on the next macrotask, after the current microtasks have drained, as
 * `setTimeout(callback, 0)` would, but without its minimum delay: Node.js clamps it to 1 ms and
 * browsers to 4 ms once timers nest, which a guest that yields often pays on every yield.
 * Returns a function that cancels the callback.
 */
export function onNextMacrotask(callback: () => void): () => void {
    if (typeof MessageChannel === 'function') {
        const channel = idleChannel ?? new MessageChannel();
        idleChannel = undefined;
        let pending = true;
        channel.port1.onmessage = () => {
            pending = false;
            channel.port1.onmessage = null;
            // Keep one idle channel across turns. Detaching the listener also lets the host exit.
            if (idleChannel) {
                channel.port1.close();
                channel.port2.close();
            } else {
                idleChannel = channel;
            }
            callback();
        };
        channel.port2.postMessage(null);
        return () => {
            if (!pending) {
                return;
            }
            pending = false;
            channel.port1.onmessage = null;
            channel.port1.close();
            channel.port2.close();
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

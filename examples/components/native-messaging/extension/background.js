if (typeof importScripts === 'function') {
    importScripts('config.js');
}

const runtime = globalThis.browser?.runtime ?? globalThis.chrome.runtime;

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function createInbox(port) {
    const queued = [];
    const waiting = [];
    let disconnected;

    port.onMessage.addListener((message) => {
        const resolve = waiting.shift();
        if (resolve) {
            resolve(message);
        } else {
            queued.push(message);
        }
    });
    port.onDisconnect.addListener(() => {
        const detail = globalThis.chrome?.runtime?.lastError?.message;
        disconnected = new Error(detail ?? 'native-messaging port disconnected');
        while (waiting.length > 0) {
            waiting.shift()(Promise.reject(disconnected));
        }
    });

    return async function nextMessage() {
        if (queued.length > 0) {
            return queued.shift();
        }
        if (disconnected) {
            throw disconnected;
        }
        const result = await Promise.race([
            new Promise((resolve) => waiting.push(resolve)),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('native host did not respond within 20 seconds')), 20_000),
            ),
        ]);
        return await result;
    };
}

async function run() {
    const port = runtime.connectNative(TEST_CONFIG.hostName);
    const nextMessage = createInbox(port);

    try {
        const small = { kind: 'small', text: 'Hello from Firefox first: 🦊' };
        port.postMessage(small);
        assert(JSON.stringify(await nextMessage()) === JSON.stringify(small), 'small message did not round trip');

        const persistent = ['persistent', { nested: [1, 2, 3] }, 'string,with,commas'];
        port.postMessage(persistent);
        assert(
            JSON.stringify(await nextMessage()) === JSON.stringify(persistent),
            'second message on the persistent connection did not round trip',
        );

        const large = Array.from({ length: 5_000 }, (_, index) => ({
            index,
            text: `${index}: ${'native messaging, with nested JSON; '.repeat(8)}`,
        }));
        const received = [];
        let chunks = 0;
        port.postMessage(large);
        while (received.length < large.length) {
            const chunk = await nextMessage();
            assert(Array.isArray(chunk), 'chunked response was not a JSON array');
            received.push(...chunk);
            chunks += 1;
        }

        assert(chunks > 1, 'large response was not split into multiple messages');
        assert(received.length === large.length, 'chunked response changed the array length');
        for (let index = 0; index < large.length; index += 1) {
            assert(
                received[index].index === index && received[index].text === large[index].text,
                `chunked response changed element ${index}`,
            );
        }

        port.disconnect();
        return { browser: TEST_CONFIG.browser, chunks, ok: true };
    } catch (error) {
        port.disconnect();
        return {
            browser: TEST_CONFIG.browser,
            message: error?.stack ?? String(error),
            ok: false,
        };
    }
}

runtime.onMessage.addListener((message) => {
    if (message.action === 'run-native-messaging-test') {
        return run();
    }
});

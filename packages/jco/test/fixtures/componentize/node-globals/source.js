async function readAll(stream) {
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
        const result = await reader.read();
        if (result.done) {
            return chunks;
        }
        chunks.push(result.value);
    }
}

function concatenateBytes(chunks) {
    const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

async function compressionRoundTrip(input) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const compression = new CompressionStream("gzip");
    const compressedPromise = readAll(compression.readable);
    const compressionWriter = compression.writable.getWriter();
    await compressionWriter.write(encoder.encode(input));
    await compressionWriter.close();
    const compressed = await compressedPromise;

    const decompression = new DecompressionStream("gzip");
    const decompressedPromise = readAll(decompression.readable);
    const decompressionWriter = decompression.writable.getWriter();
    for (const chunk of compressed) {
        await decompressionWriter.write(chunk);
    }
    await decompressionWriter.close();
    const decompressed = await decompressedPromise;
    return decoder.decode(concatenateBytes(decompressed));
}

async function testTimers() {
    let cancelledTimeoutRan = false;
    const cancelledTimeout = setTimeout(() => {
        cancelledTimeoutRan = true;
    }, 0);
    clearTimeout(cancelledTimeout);

    let microtaskRan = false;
    queueMicrotask(() => {
        microtaskRan = true;
    });

    const intervalRan = await new Promise((resolve) => {
        const interval = setInterval(() => {
            clearInterval(interval);
            resolve(true);
        }, 0);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    return { cancelledTimeoutRan, intervalRan, microtaskRan };
}

export async function run() {
    const abortController = new AbortController();
    const combinedSignal = AbortSignal.any([abortController.signal]);
    abortController.abort("stopped");
    let abortReason = "";
    try {
        combinedSignal.throwIfAborted();
    } catch (reason) {
        abortReason = reason;
    }

    const blob = new Blob(["blob value"]);
    const file = new File(["file value"], "value.txt", {
        lastModified: 24,
        type: "text/plain",
    });

    const buffer = Buffer.from("component ✓", "utf8");
    const byteStrategy = new ByteLengthQueuingStrategy({ highWaterMark: 8 });
    const countStrategy = new CountQueuingStrategy({ highWaterMark: 4 });

    const eventTarget = new EventTarget();
    let eventDetail = 0;
    eventTarget.addEventListener("value", (event) => {
        eventDetail = event.detail;
    });
    const customEvent = new CustomEvent("value", { detail: 24 });
    const eventDispatched = eventTarget.dispatchEvent(customEvent);
    const plainEvent = new Event("plain");
    const domException = new DOMException("stopped", "AbortError");

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode("abc")));
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode("0123456789abcdef"),
        { hash: "SHA-256", name: "HMAC" },
        false,
        ["sign"],
    );

    const headers = new Headers({ "x-value": "24" });
    const request = new Request("https://example.com/path?value=24", { headers });
    const response = new Response("response value", { status: 201 });
    const formData = new FormData();
    formData.set("value", "24");

    let readableController;
    const readable = new ReadableStream({
        start(controller) {
            readableController = controller;
            controller.enqueue("readable value");
            controller.close();
        },
    });
    const defaultReader = readable.getReader();
    const readableResult = await defaultReader.read();

    let byteController;
    const byteStream = new ReadableStream({
        type: "bytes",
        start(controller) {
            byteController = controller;
            controller.enqueue(new Uint8Array([24]));
            controller.close();
        },
    });
    const byobReader = byteStream.getReader({ mode: "byob" });
    const byobResult = await byobReader.read(new Uint8Array(1));

    const written = [];
    const writable = new WritableStream({
        write(chunk) {
            written.push(chunk);
        },
    });
    const writableWriter = writable.getWriter();
    await writableWriter.write("writable value");
    await writableWriter.close();

    const transform = new TransformStream({
        transform(chunk, controller) {
            controller.enqueue(chunk.toUpperCase());
        },
    });
    const transformedPromise = transform.readable.getReader().read();
    const transformWriter = transform.writable.getWriter();
    await transformWriter.write("transform value");
    await transformWriter.close();
    const transformed = await transformedPromise;

    const cloneSource = { nested: { value: 24 } };
    const clone = structuredClone(cloneSource);
    const url = new URL("https://example.com/path?first=one");
    url.searchParams.set("second", "two words");
    const standaloneParams = new URLSearchParams({ value: "two words" });

    const before = performance.now();
    const timers = await testTimers();
    const after = performance.now();

    const wasmBytes = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03, 0x02, 0x01,
        0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00, 0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b,
    ]);
    const wasm = await WebAssembly.instantiate(wasmBytes);

    return JSON.stringify({
        abort: combinedSignal instanceof AbortSignal && combinedSignal.aborted && abortReason === "stopped",
        base64: atob(btoa("component")) === "component",
        blob: blob instanceof Blob && (await blob.text()) === "blob value",
        buffer:
            buffer.toString("hex") === "636f6d706f6e656e7420e29c93" &&
            globalThis.Buffer === Buffer &&
            Buffer.isBuffer(buffer),
        byteLengthQueuingStrategy: byteStrategy.highWaterMark === 8 && byteStrategy.size(new Uint8Array(3)) === 3,
        compression: (await compressionRoundTrip("compressed value")) === "compressed value",
        console:
            typeof console.log === "function" &&
            typeof console.error === "function" &&
            typeof console.time === "function",
        countQueuingStrategy: countStrategy.highWaterMark === 4 && countStrategy.size("value") === 1,
        crypto:
            crypto instanceof Crypto &&
            crypto.subtle instanceof SubtleCrypto &&
            cryptoKey instanceof CryptoKey &&
            [...digest].slice(0, 4).join(",") === "186,120,22,191",
        customEvent: customEvent instanceof CustomEvent && eventDetail === 24 && eventDispatched,
        domException:
            domException instanceof DOMException &&
            domException.name === "AbortError" &&
            domException.message === "stopped",
        event: plainEvent instanceof Event && plainEvent.type === "plain",
        eventTarget: eventTarget instanceof EventTarget,
        fetch:
            typeof fetch === "function" &&
            request instanceof Request &&
            request.headers.get("x-value") === "24" &&
            response instanceof Response &&
            response.status === 201 &&
            (await response.text()) === "response value",
        file:
            file instanceof File &&
            file instanceof Blob &&
            file.name === "value.txt" &&
            file.lastModified === 24 &&
            (await file.text()) === "file value",
        formData: formData instanceof FormData && formData.get("value") === "24",
        headers: headers instanceof Headers && headers.get("x-value") === "24",
        performance: performance instanceof Performance && after >= before,
        queueMicrotask: timers.microtaskRan,
        readableByteStreamController:
            byteController instanceof ReadableByteStreamController && byobResult.value[0] === 24,
        readableStream:
            readable instanceof ReadableStream &&
            defaultReader instanceof ReadableStreamDefaultReader &&
            readableController instanceof ReadableStreamDefaultController &&
            readableResult.value === "readable value",
        readableStreamByob:
            byobReader instanceof ReadableStreamBYOBReader && typeof ReadableStreamBYOBRequest === "function",
        structuredClone: clone !== cloneSource && clone.nested !== cloneSource.nested && clone.nested.value === 24,
        textCodec: decoder.decode(encoder.encode("encoded ✓")) === "encoded ✓",
        timers: timers.intervalRan && !timers.cancelledTimeoutRan,
        transformStream: transform instanceof TransformStream && transformed.value === "TRANSFORM VALUE",
        url:
            url instanceof URL &&
            url.searchParams instanceof URLSearchParams &&
            url.searchParams.get("second") === "two words" &&
            standaloneParams.toString() === "value=two+words",
        wasm: wasm.instance.exports.run() === 42,
        writableStream: writable instanceof WritableStream && written.join() === "writable value",
    });
}

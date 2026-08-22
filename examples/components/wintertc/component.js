import { registerHttpHandler } from './http.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesEqual(left, right) {
    return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

export async function exerciseWebApis() {
    const results = {};

    const url = new URL('../report?api=url&api=search-params', 'https://example.com/examples/');
    results.url =
        url.href === 'https://example.com/report?api=url&api=search-params' &&
        url.searchParams.getAll('api').join(',') === 'url,search-params';

    const text = 'Portable Web APIs: 🌐';
    results.textEncoding = decoder.decode(encoder.encode(text)) === text;
    results.base64 = atob(btoa('component-model')) === 'component-model';

    const random = new Uint8Array(16);
    const filledRandom = crypto.getRandomValues(random);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('jco')));
    results.crypto =
        filledRandom === random &&
        random.length === 16 &&
        digest.length === 32 &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(crypto.randomUUID());

    const start = performance.now();
    results.performance = performance.now() >= start;

    const blob = new Blob(['portable', ' ', 'blob'], { type: 'text/plain' });
    results.blob = blob.type === 'text/plain' && (await blob.text()) === 'portable blob';

    const file = new File(['portable file'], 'example.txt', {
        type: 'text/plain',
        lastModified: 123,
    });
    results.file =
        file.name === 'example.txt' &&
        file.type === 'text/plain' &&
        file.lastModified === 123 &&
        (await file.text()) === 'portable file';

    const form = new FormData();
    form.append('runtime', 'StarlingMonkey');
    results.formData = form.get('runtime') === 'StarlingMonkey' && form.has('runtime');

    const original = { nested: { value: 42 }, bytes: new Uint8Array([1, 2, 3]) };
    const cloned = structuredClone(original);
    cloned.nested.value = 7;
    results.structuredClone =
        original.nested.value === 42 && cloned.nested.value === 7 && bytesEqual(cloned.bytes, original.bytes);

    const target = new EventTarget();
    let eventDetail;
    target.addEventListener('portable', (event) => {
        eventDetail = event.detail;
    });
    target.dispatchEvent(new CustomEvent('portable', { detail: 'events' }));
    results.events = eventDetail === 'events';

    const controller = new AbortController();
    controller.abort('finished');
    results.abort = controller.signal.aborted && controller.signal.reason === 'finished';

    const exception = new DOMException('portable', 'DataError');
    results.domException = exception.name === 'DataError' && exception.message === 'portable';

    let microtaskRan = false;
    await new Promise((resolve) => {
        queueMicrotask(() => {
            microtaskRan = true;
            resolve();
        });
    });
    results.microtask = microtaskRan;

    let timerRan = false;
    await new Promise((resolve) => {
        setTimeout(() => {
            timerRan = true;
            resolve();
        }, 0);
    });
    results.timers = timerRan;

    const transformed = await new Response(
        new Blob(['web streams']).stream().pipeThrough(
            new TransformStream({
                transform(chunk, streamController) {
                    streamController.enqueue(chunk);
                },
            }),
        ),
    ).text();
    results.streams = transformed === 'web streams';

    const compressed = await new Response(
        new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();
    const decompressed = await new Response(
        new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
    results.compressionStreams = decompressed === text;

    const headers = new Headers({ 'x-runtime': 'starlingmonkey' });
    const request = new Request('https://example.com/data', { headers });
    const response = Response.json({ portable: true }, { status: 201 });
    results.fetchPrimitives =
        request.headers.get('x-runtime') === 'starlingmonkey' &&
        response.status === 201 &&
        (await response.json()).portable === true;

    return results;
}

registerHttpHandler(exerciseWebApis);

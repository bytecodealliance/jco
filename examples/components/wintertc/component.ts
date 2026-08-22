import { testAbortController } from './builtins/abort-controller.ts';
import { testAtob } from './builtins/atob.ts';
import { testBlob } from './builtins/blob.ts';
import { testBtoa } from './builtins/btoa.ts';
import { testCompressionStream } from './builtins/compression-stream.ts';
import { testCrypto } from './builtins/crypto.ts';
import { testCustomEvent } from './builtins/custom-event.ts';
import { testDecompressionStream } from './builtins/decompression-stream.ts';
import { testDomException } from './builtins/dom-exception.ts';
import { testEventTarget } from './builtins/event-target.ts';
import { testFile } from './builtins/file.ts';
import { testFormData } from './builtins/form-data.ts';
import { testHeaders } from './builtins/headers.ts';
import { testPerformance } from './builtins/performance.ts';
import { testQueueMicrotask } from './builtins/queue-microtask.ts';
import { testReadableStream } from './builtins/readable-stream.ts';
import { testRequest } from './builtins/request.ts';
import { testResponse } from './builtins/response.ts';
import { testStructuredClone } from './builtins/structured-clone.ts';
import { testTextDecoder } from './builtins/text-decoder.ts';
import { testTextEncoder } from './builtins/text-encoder.ts';
import { testTimers } from './builtins/timers.ts';
import { testTransformStream } from './builtins/transform-stream.ts';
import { testUrlSearchParams } from './builtins/url-search-params.ts';
import { testUrl } from './builtins/url.ts';
import { testWritableStream } from './builtins/writable-stream.ts';
import { registerHttpHandler, type Results } from './http.ts';

export async function exerciseWebApis(): Promise<Results> {
    return {
        abortController: testAbortController(),
        atob: testAtob(),
        blob: await testBlob(),
        btoa: testBtoa(),
        compressionStream: await testCompressionStream(),
        crypto: await testCrypto(),
        customEvent: testCustomEvent(),
        decompressionStream: await testDecompressionStream(),
        domException: testDomException(),
        eventTarget: testEventTarget(),
        file: await testFile(),
        formData: testFormData(),
        headers: testHeaders(),
        performance: testPerformance(),
        queueMicrotask: await testQueueMicrotask(),
        readableStream: await testReadableStream(),
        request: testRequest(),
        response: await testResponse(),
        structuredClone: testStructuredClone(),
        textDecoder: testTextDecoder(),
        textEncoder: testTextEncoder(),
        timers: await testTimers(),
        transformStream: await testTransformStream(),
        url: testUrl(),
        urlSearchParams: testUrlSearchParams(),
        writableStream: await testWritableStream(),
    };
}

registerHttpHandler(exerciseWebApis);

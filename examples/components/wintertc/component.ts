import * as builtins from './builtins/index.ts';
import { registerHttpHandler, type Results } from './http.ts';

export async function exerciseWebApis(): Promise<Results> {
    return {
        abortController: builtins.testAbortController(),
        atob: builtins.testAtob(),
        blob: await builtins.testBlob(),
        btoa: builtins.testBtoa(),
        compressionStream: await builtins.testCompressionStream(),
        crypto: await builtins.testCrypto(),
        customEvent: builtins.testCustomEvent(),
        decompressionStream: await builtins.testDecompressionStream(),
        domException: builtins.testDomException(),
        eventTarget: builtins.testEventTarget(),
        file: await builtins.testFile(),
        formData: builtins.testFormData(),
        headers: builtins.testHeaders(),
        performance: builtins.testPerformance(),
        queueMicrotask: await builtins.testQueueMicrotask(),
        readableStream: await builtins.testReadableStream(),
        request: builtins.testRequest(),
        response: await builtins.testResponse(),
        structuredClone: builtins.testStructuredClone(),
        textDecoder: builtins.testTextDecoder(),
        textEncoder: builtins.testTextEncoder(),
        timers: await builtins.testTimers(),
        transformStream: await builtins.testTransformStream(),
        url: builtins.testUrl(),
        urlSearchParams: builtins.testUrlSearchParams(),
        writableStream: await builtins.testWritableStream(),
    };
}

registerHttpHandler(exerciseWebApis);

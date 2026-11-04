import { Worker } from 'node:worker_threads';
import { Buffer } from 'node:buffer';

import { assert } from 'vitest';

import { Fields, Request, Response } from '@bytecodealliance/preview3-shim/http';
import { stream } from '@bytecodealliance/preview3-shim/stream';
import { future } from '@bytecodealliance/preview3-shim/future';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

const WASI_HTTP_HANDLER_EXPORT = 'wasi:http/handler@0.3.0';

const DEFAULT_REQUEST = {
    method: 'GET',
    scheme: 'http',
    authority: 'localhost',
    pathWithQuery: '/',
};

const DEFAULT_EXPECT = {
    status: 200,
};

function buildFields(entries) {
    return Fields.fromList(Object.entries(entries ?? {}).map(([name, value]) => [name, ENCODER.encode(value)]));
}

function fieldsToObject(fields) {
    return Object.fromEntries(fields.copyAll().map(([name, value]) => [name, DECODER.decode(value)]));
}

export async function startP3HttpServer() {
    const worker = new Worker(new URL('./http-server-worker.js', import.meta.url), { execArgv: [] });
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    let resolveExit;
    const exit = new Promise((resolve) => {
        resolveExit = resolve;
    });
    let failure;
    let closed = false;
    let exited = false;
    let cleanupPromise;
    worker.on('message', (message) => {
        if (message.type === 'ready') {
            resolveReady(message.address);
        } else if (message.type === 'closed') {
            closed = true;
        }
    });
    worker.on('error', (error) => {
        failure ??= error;
        rejectReady(error);
    });
    worker.on('exit', (code) => {
        exited = true;
        if (code !== 0 || !closed) {
            failure ??= new Error(`P3 HTTP server worker exited before closing (code ${code})`);
            rejectReady(failure);
        }
        resolveExit();
    });

    let address;
    try {
        address = await ready;
    } catch (error) {
        await worker.terminate();
        throw error;
    }
    return {
        address,
        cleanup() {
            cleanupPromise ??= (async () => {
                if (!exited) {
                    worker.postMessage({ type: 'close' });
                }
                await exit;
                if (failure) {
                    throw failure;
                }
            })();
            return cleanupPromise;
        },
    };
}

export function createEchoHandler() {
    return {
        async handle(request) {
            const { rx: requestResultRx } = future();
            const [bodyReader, trailerReader] = Request.consumeBody(request, requestResultRx);
            const headers = request.getHeaders().copyAll();
            const body = bodyReader ? await bodyReader.readAll() : Buffer.alloc(0);
            const trailers = await trailerReader.read();

            const { tx: bodyTx, rx: bodyRx } = stream();
            const { tx: trailersTx, rx: trailersRx } = future();
            const [response] = Response.new(Fields.fromList(headers), bodyRx, trailersRx);

            const pump = (async () => {
                if (body.length > 0) {
                    await bodyTx.write(body);
                }
                await bodyTx.close();
                await trailersTx.write(trailers);
            })();

            pump.catch(() => {});
            return response;
        },
    };
}

/**
 * Invoke a transpiled `wasi:http/handler@0.3.0` component with a synthetic
 * request and assert against the response.
 */
export async function runHandlerFixture({ esModule, outbound = {}, expect = {} }) {
    const req = { ...DEFAULT_REQUEST, ...outbound };
    const exp = { ...DEFAULT_EXPECT, ...expect };

    if (esModule.$init) {
        await esModule.$init;
    }

    const handlerIface = esModule[WASI_HTTP_HANDLER_EXPORT] ?? esModule.handler;
    assert.isObject(handlerIface, `${WASI_HTTP_HANDLER_EXPORT}.handle export missing`);
    assert.isFunction(handlerIface.handle, `${WASI_HTTP_HANDLER_EXPORT}.handle export missing`);

    const { tx: bodyTx, rx: bodyRx } = stream();
    const { tx: trailersTx, rx: trailersRx } = future();

    const reqHeaders = buildFields(req.headers);
    const [request] = Request.new(reqHeaders, bodyRx, trailersRx, null);

    request.setMethod(req.method);
    request.setScheme(req.scheme);
    request.setAuthority(req.authority);
    request.setPathWithQuery(req.pathWithQuery);

    const pump = (async () => {
        if (req.body !== undefined && req.body !== null) {
            await bodyTx.write(Buffer.from(req.body));
        }
        await bodyTx.close();
        const tval = req.trailers ? buildFields(req.trailers) : undefined;
        await trailersTx.write({ tag: 'ok', val: tval });
    })();

    const response = await handlerIface.handle(request);
    await pump;

    assert.strictEqual(response.getStatusCode(), exp.status, 'response status');

    const actualHeaders = fieldsToObject(response.getHeaders());
    for (const [name, value] of Object.entries(exp.headers ?? {})) {
        assert.strictEqual(actualHeaders[name], value, `response header ${name}`);
    }

    const { rx: resultRx } = future();
    const [bodyReader, trailerReader] = Response.consumeBody(response, resultRx);

    if ('body' in exp) {
        const bytes = bodyReader ? await bodyReader.readAll() : Buffer.alloc(0);
        assert.strictEqual(bytes.toString('utf8'), exp.body, 'response body');
    }

    const trailerResult = await trailerReader.read();
    assert.strictEqual(trailerResult?.tag, 'ok', `trailers errored: ${JSON.stringify(trailerResult)}`);

    const maybeTrailer = trailerResult.val;
    const actualTrailers = maybeTrailer ? fieldsToObject(maybeTrailer) : {};

    for (const [name, value] of Object.entries(exp.trailers ?? {})) {
        assert.strictEqual(actualTrailers[name], value, `response trailer ${name}`);
    }
}

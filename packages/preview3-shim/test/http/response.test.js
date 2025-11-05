import { TextEncoder } from 'node:util';

import {
    describe,
    test,
    expect,
    beforeEach,
} from 'vitest';

import {
    Fields,
    HttpError,
    Response,
} from '@bytecodealliance/preview3-shim/http';

import { FutureReader, future } from '@bytecodealliance/preview3-shim/future';
import { stream } from '@bytecodealliance/preview3-shim/stream';

const ENCODER = new TextEncoder();

describe('Response', () => {
    // Prepare common test variables
    let headers;
    let contents;
    let trailers;

    beforeEach(() => {
        headers = new Fields();
        headers.append('content-type', ENCODER.encode('text/plain'));

        const { bodyRx } = stream();
        contents = bodyRx;

        const { rx: trailerRx } = future();
        trailers = trailerRx;
    });

    test('should prevent direct constructor calls', () => {
        expect(() => new Response()).toThrowError(
            'Use Response.new(...) to create a Response'
        );
    });

    test('new() returns Response and FutureReader', () => {
        const { res, future } = Response.new(headers, contents, trailers);
        expect(res).toBeInstanceOf(Response);
        expect(future).toBeInstanceOf(FutureReader);
        expect(res.statusCode()).toBe(200); // Default status code
    });

    test('new() validates arguments', () => {
        expect(() => Response.new('invalid', contents, trailers)).toThrow(
            HttpError
        );
        expect(() => Response.new('invalid', contents, trailers)).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-argument' } })
        );

        expect(() => Response.new(headers, 'invalid', trailers)).toThrow(
            HttpError
        );
        expect(() => Response.new(headers, 'invalid', trailers)).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-argument' } })
        );

        expect(() => Response.new(headers, contents, 'invalid')).toThrow(
            HttpError
        );
        expect(() => Response.new(headers, contents, 'invalid')).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-argument' } })
        );
    });

    test('contents can be null', () => {
        const { res } = Response.new(headers, null, trailers);
        expect(res).toBeInstanceOf(Response);
    });

    test('statusCode() returns the current status code', () => {
        const { res } = Response.new(headers, contents, trailers);
        expect(res.statusCode()).toBe(200); // Default
    });

    test('setStatusCode() changes the status code', () => {
        const { res } = Response.new(headers, contents, trailers);
        res.setStatusCode(404);
        expect(res.statusCode()).toBe(404);

        res.setStatusCode(500);
        expect(res.statusCode()).toBe(500);
    });

    test('setStatusCode() validates the status code', () => {
        const { res } = Response.new(headers, contents, trailers);

        expect(() => res.setStatusCode('200')).toThrow(HttpError);
        expect(() => res.setStatusCode(200.5)).toThrow(HttpError);
        expect(() => res.setStatusCode(99)).toThrow(HttpError);
        expect(() => res.setStatusCode(600)).toThrow(HttpError);
    });

    test('headers() returns the immutable headers', () => {
        const { res } = Response.new(headers, contents, trailers);
        const respHeaders = res.headers();

        expect(respHeaders).toBe(headers);
        expect(() =>
            respHeaders.append('x-test', ENCODER.encode('value'))
        ).toThrow(expect.objectContaining({ payload: { tag: 'immutable' } }));
    });

    test('body() returns the contents stream and trailers future', () => {
        const { res } = Response.new(headers, contents, trailers);
        const { body, trailers: t } = res.body();

        expect(body).toBe(contents);
        expect(t).toBe(trailers);
    });

    test('_resolve method completes the response future', async () => {
        const { res, future } = Response.new(headers, contents, trailers);

        const futurePromise = future.read().then((result) => result);
        res._resolve({ tag: 'ok', val: null });

        const result = await futurePromise;
        expect(result).toEqual({ tag: 'ok', val: null });

        res._resolve({ tag: 'ok', val: 'should not be received' });
    });
});

describe('Response.body single-stream semantics', () => {
    test('throws if body() called twice without closing', async () => {
        const headers = new Fields();
        const { tx: bodyTx, rx: bodyRx } = stream();
        const { tx: trailersTx, rx: trailersRx } = future();
        const { res } = Response.new(headers, bodyRx, trailersRx);

        res.body();
        expect(() => res.body()).toThrowError(HttpError);

        await bodyTx.close();
        await trailersTx.write(null);
    });

    test('throws after the stream has ended', async () => {
        const headers = new Fields();
        const { tx: bodyTx, rx: bodyRx } = stream();
        const { tx: trailersTx, rx: trailersRx } = future();
        const { res } = Response.new(headers, bodyRx, trailersRx);

        const { body } = res.body();
        await bodyTx.write(Buffer.from('x'));
        await bodyTx.close();
        await trailersTx.write(null);

        while ((await body.read()) !== null) {}
        expect(() => res.body()).toThrowError(HttpError);
    });
});

import { TextEncoder } from 'node:util';

import {
    describe,
    test,
    expect,
} from 'vitest';

import {
    Fields,
    HttpError,
    RequestOptions,
    Request,
} from '@bytecodealliance/preview3-shim/http';

import { FutureReader, future } from '@bytecodealliance/preview3-shim/future';
import { stream } from '@bytecodealliance/preview3-shim/stream';

const ENCODER = new TextEncoder();

describe('Request', () => {
    const headers = new Fields();
    headers.append('x-test', ENCODER.encode('a'));

    const options = new RequestOptions();
    const contents = null;
    const trailers = new FutureReader(Promise.resolve({ ok: null }));

    test('should prevent direct constructor calls', () => {
        expect(() => new Request()).toThrowError(
            'Use Request.new(...) to create a Request'
        );
    });

    test('new() returns Request and FutureReader with defaults', () => {
        const { req, future } = Request.new(
            headers,
            contents,
            trailers,
            options
        );
        expect(req).toBeInstanceOf(Request);
        expect(future).toBeInstanceOf(FutureReader);
        expect(req.method()).toBe('get');
        expect(req.pathWithQuery()).toBeNull();
        expect(req.scheme()).toBeNull();
        expect(req.authority()).toBeNull();
    });

    test('setMethod accepts standard and custom methods', () => {
        const { req } = Request.new(headers, contents, trailers, options);

        req.setMethod('POST');
        expect(req.method()).toEqual({ tag: 'post' });

        req.setMethod('X-CUSTOM');
        expect(req.method()).toEqual({ tag: 'other', val: 'x-custom' });
    });

    test('setMethod rejects invalid syntax', () => {
        const { req } = Request.new(headers, contents, trailers, options);
        expect(() => req.setMethod('BAD METHOD')).toThrowError(HttpError);
        expect(() => req.setMethod('BAD METHOD')).toThrowError(
            expect.objectContaining({ payload: { tag: 'invalid-syntax' } })
        );
    });

    test('setScheme handles valid and invalid schemes', () => {
        const { req } = Request.new(headers, contents, trailers, options);

        req.setScheme('https');
        expect(req.scheme()).toBe('https');

        req.setScheme(null);
        expect(req.scheme()).toBeNull();

        expect(() => req.setScheme('1nvalid')).toThrowError(
            expect.objectContaining({ payload: { tag: 'invalid-syntax' } })
        );
    });

    test('setAuthority handles valid and invalid authorities', () => {
        const { req } = Request.new(headers, contents, trailers, options);

        req.setAuthority('example.com:8080');
        expect(req.authority()).toBe('example.com:8080');

        req.setAuthority(null);
        expect(req.authority()).toBeNull();

        expect(() => req.setAuthority('::invalid::')).toThrowError(
            expect.objectContaining({ payload: { tag: 'invalid-syntax' } })
        );
    });

    test('headers() and options() are immutable', () => {
        const { req } = Request.new(headers, contents, trailers, options);

        expect(() =>
            req.headers().append('x', new Uint8Array([0]))
        ).toThrowError(
            expect.objectContaining({ payload: { tag: 'immutable' } })
        );

        expect(() => req.options().setConnectTimeout(1000)).toThrowError(
            expect.objectContaining({ payload: { tag: 'immutable' } })
        );
    });
});

describe('Request.body single-stream semantics', () => {
    test('throws if body() called twice without closing', async () => {
        const headers = new Fields();
        const { tx: bodyTx, rx: bodyRx } = stream();
        const { tx: trailersTx, rx: trailersRx } = future();
        const { req } = Request.new(headers, bodyRx, trailersRx);

        req.body();
        expect(() => req.body()).toThrowError(HttpError);

        await bodyTx.close();
        await trailersTx.write(null);
    });

    test('throws after the stream has ended', async () => {
        const headers = new Fields();
        const { tx: bodyTx, rx: bodyRx } = stream();
        const { tx: trailersTx, rx: trailersRx } = future();
        const { req } = Request.new(headers, bodyRx, trailersRx);

        const { body } = req.body();
        await bodyTx.write(Buffer.from('data'));
        await bodyTx.close();
        await trailersTx.write(null);

        while ((await body.read()) !== null) {}
        expect(() => req.body()).toThrowError(HttpError);
    });
});

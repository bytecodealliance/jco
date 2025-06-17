import http from 'node:http';
import { TextEncoder, TextDecoder } from 'node:util';

import {
    describe,
    test,
    expect,
    afterAll,
    beforeAll,
    beforeEach,
} from 'vitest';

import {
    Fields,
    HttpError,
    HttpServer,
    HttpClient,
    RequestOptions,
    Request,
    Response,
    _forbiddenHeaders,
} from '@bytecodealliance/preview3-shim/http';

import { FutureReader, future } from '@bytecodealliance/preview3-shim/future';
import { stream } from '@bytecodealliance/preview3-shim/stream';

import { getRandomPort } from './helpers';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

describe('Fields tests', () => {
    test('constructs fields with multiple values per name', () => {
        const fields = Fields.fromList([
            ['X-Test', [ENCODER.encode('one'), ENCODER.encode('two')]],
        ]);
        const values = fields.get('x-test').map((v) => DECODER.decode(v));
        expect(values).toEqual(['one', 'two']);
        expect(fields.has('X-TEST')).toBe(true);
    });

    test('throws forbidden error for a forbidden header name', () => {
        expect(() => {
            Fields.fromList([['Host', ENCODER.encode('example')]]);
        }).toThrow(HttpError);

        try {
            Fields.fromList([['Connection', ENCODER.encode('keep-alive')]]);
        } catch (err) {
            expect(err).toBeInstanceOf(HttpError);
            expect(err.payload.tag).toBe('forbidden');
        }

        _forbiddenHeaders.value.add('new-forbidden');
        expect(() => {
            Fields.fromList([['New-Forbidden', ENCODER.encode('example')]]);
        }).toThrow(HttpError);
    });

    test('appends and retrieves values correctly', () => {
        const f = new Fields();
        f.append('X-Custom', ENCODER.encode('a'));
        f.append('x-custom', ENCODER.encode('b'));
        expect(f.has('X-CUSTOM')).toBe(true);
        const result = f.get('x-custom').map((v) => DECODER.decode(v));
        expect(result).toEqual(['a', 'b']);
    });

    test('preserves insertion order in entries()', () => {
        const f = new Fields();
        f.append('A', ENCODER.encode('1'));
        f.append('B', ENCODER.encode('2'));
        const ents = f.entries().map(([n, v]) => [n, DECODER.decode(v)]);
        expect(ents).toEqual([
            ['A', '1'],
            ['B', '2'],
        ]);
    });

    test('set replaces previous values', () => {
        const f = new Fields();
        f.append('Tok', ENCODER.encode('one'));
        f.set('Tok', [ENCODER.encode('two'), ENCODER.encode('three')]);
        const vals = f.get('tok').map((v) => DECODER.decode(v));
        expect(vals).toEqual(['two', 'three']);
    });

    test('delete removes the header entirely', () => {
        const f = new Fields();
        f.append('D', ENCODER.encode('x'));
        f.delete('d');
        expect(f.has('D')).toBe(false);
        expect(f.get('d')).toEqual([]);
    });

    test('getAndDelete returns old values and deletes', () => {
        const f = new Fields();
        f.append('G', ENCODER.encode('v1'));
        f.append('G', ENCODER.encode('v2'));
        const old = f.getAndDelete('g').map((v) => DECODER.decode(v));
        expect(old).toEqual(['v1', 'v2']);
        expect(f.has('G')).toBe(false);
    });

    test('throws invalid-syntax on setting an invalid name', () => {
        const f = new Fields();
        expect(() => f.set('\nBad', [ENCODER.encode('x')])).toThrow(HttpError);
    });

    test('throws forbidden on setting a forbidden name', () => {
        const f = new Fields();
        expect(() => f.set('Host', [ENCODER.encode('h')])).toThrow(HttpError);
    });
});

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

describe('HttpServer Integration', () => {
    let server;
    let host;
    let port;

    beforeAll(async () => {
        const handler = {
            async handle() {
                const { tx: bodyTx, rx: bodyRx } = stream();
                const { tx: trailersTx, rx: trailersRx } = future();
                const headers = new Fields();
                headers.append('content-type', ENCODER.encode('text/plain'));
                headers.append('trailer', ENCODER.encode('content-md5'));

                const { res } = Response.new(headers, bodyRx, trailersRx);

                res.setStatusCode(200);
                await bodyTx.write(Buffer.from('hello world'));
                await bodyTx.close();
                await trailersTx.write(null);
                return { tag: 'ok', val: res };
            },
        };

        server = new HttpServer(handler);
        host = '127.0.0.1';
        port = await getRandomPort();
        await server.listen(port, host);
    });

    afterAll(async () => {
        await server.close();
    });

    test('responds with 200 and "hello world"', async () => {
        const res = await fetch(`http:${host}:${port}/`);
        expect(res.status).toBe(200);

        const text = await res.text();
        expect(text).toBe('hello world');
        expect(res.headers.get('content-type')).toBe('text/plain');
    });
});

describe('HttpServer Error', () => {
    test('emits error event when handler throws', async (done) => {
        let host = '127.0.0.1';
        let port = await getRandomPort();

        const throwingHandler = {
            async handle() {
                throw new Error('handler failure');
            },
        };

        const server = new HttpServer(throwingHandler);
        server.on('error', (err) => {
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('handler failure');
            server.close().then(done);
        });

        server.listen(port, host).then(() => {
            fetch(`http://${host}:${port}/`).catch(() => {});
        });
    });
});

describe('HttpClient Integration', () => {
    let server;
    let authority;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            if (req.url === '/error') {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: 'Server error' }));
            }

            if (req.url === '/delayed-first-byte') {
                return setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('ok');
                }, 200);
            }

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Test-Header', 'test-value');
            res.statusCode = 200;

            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const responseBody = JSON.stringify({
                    method: req.method,
                    path: req.url,
                    headers: req.headers,
                    body: Buffer.concat(chunks).toString(),
                });
                res.end(responseBody);
            });
        });

        const host = '127.0.0.1';
        const port = await getRandomPort();
        authority = `${host}:${port}`;
        server.listen(port);
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    test('makes a GET request', async () => {
        const headers = new Fields();
        headers.append('accept', ENCODER.encode('application/json'));

        const { tx: trailersTx, rx: trailersRx } = future();
        const { req } = Request.new(headers, null, trailersRx);

        req.setMethod('GET');
        req.setAuthority(authority);
        req.setPathWithQuery('/test');

        trailersTx.write(null);

        const response = await HttpClient.request(req);
        expect(response.statusCode()).toBe(200);

        const responseHeaders = response.headers();
        const checkHeader = (name, expectedValue) => {
            const entry = [...responseHeaders.entries()].find(
                ([k]) => k === name
            );
            const value = entry ? entry[1] : undefined;
            expect(value).toEqual(ENCODER.encode(expectedValue));
        };

        checkHeader('content-type', 'application/json');
        checkHeader('x-test-header', 'test-value');

        const { body } = response.body();
        const stream = body.intoReadableStream();
        const reader = stream.getReader();
        let result = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            result += new TextDecoder().decode(value);
        }

        const data = JSON.parse(result);
        expect(data.method).toBe('GET');
        expect(data.path).toBe('/test');
    });

    test('makes a POST request with body', async () => {
        const headers = new Fields();
        headers.append('content-type', ENCODER.encode('application/json'));

        const { tx: bodyTx, rx: bodyRx } = stream();
        const { tx: trailersTx, rx: trailersRx } = future();

        const { req } = Request.new(headers, bodyRx, trailersRx);
        req.setMethod('POST');
        req.setAuthority(authority);
        req.setPathWithQuery('/submit');

        const requestData = JSON.stringify({
            name: 'Test User',
            email: 'test@example.com',
        });

        const responsePromise = HttpClient.request(req);

        await bodyTx.write(Buffer.from(requestData));
        await bodyTx.close();
        await trailersTx.write(null);

        const response = await responsePromise;
        expect(response.statusCode()).toBe(200);

        const { body } = response.body();
        const reader = body.intoReadableStream().getReader();
        let result = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            result += new TextDecoder().decode(value);
        }

        const data = JSON.parse(result);
        expect(data.method).toBe('POST');
        expect(data.path).toBe('/submit');
        expect(data.body).toBe(requestData);
    });

    test('handles server errors properly', async () => {
        const headers = new Fields();
        const { tx: trailersTx, rx: trailersRx } = future();

        const { req } = Request.new(headers, null, trailersRx);
        req.setMethod('GET');
        req.setAuthority(authority);
        req.setPathWithQuery('/error');

        await trailersTx.write(null);

        const response = await HttpClient.request(req);
        expect(response.statusCode()).toBe(500);

        const { body } = response.body();
        const stream = body.intoReadableStream();
        const reader = stream.getReader();
        let result = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            result += new TextDecoder().decode(value);
        }

        const data = JSON.parse(result);
        expect(data.error).toBe('Server error');
    });

    test('handles client errors', async () => {
        const headers = new Fields();
        const { tx: trailersTx, rx: trailersRx } = future();

        const { req } = Request.new(headers, null, trailersRx);
        req.setMethod('GET');

        await trailersTx.write(null);

        await expect(HttpClient.request(req)).rejects.toThrow(
            'Request.authority must be set'
        );
    });

    test('first-byte timeout triggers HttpError', async () => {
        const headers = new Fields();
        const { tx: trailersTx, rx: trailersRx } = future();

        const opts = new RequestOptions();
        opts.setFirstByteTimeout(1_000_000n); // 1 ms
        opts.setBetweenBytesTimeout(1_000_000n); // 1 ms

        const { req } = Request.new(headers, null, trailersRx, opts);
        req.setMethod('GET');
        req.setAuthority(authority);
        req.setPathWithQuery('/delayed-first-byte');

        await trailersTx.write(null);

        await expect(HttpClient.request(req)).rejects.toThrow(
            /connection-timeout/
        );
    });
});

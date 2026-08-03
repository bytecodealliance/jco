import type {
    incomingHandler as IncomingHandlerNamespace,
    outgoingHandler as OutgoingHandlerNamespace,
    types as TypesNamespace,
} from "../../types/http.js";
import type { Error as IoError } from "../../types/interfaces/wasi-io-error.js";
import type { Pollable } from "../../types/interfaces/wasi-io-poll.js";
import { inputStreamCreate, ioErrorCreate, outputStreamCreate, pollableCreate } from "./io.js";

type Result<T, E> = TypesNamespace.Result<T, E>;

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const utf8Decoder = new TextDecoder();
const forbiddenHeaders = new Set(["connection", "keep-alive", "host"]);
const DEFAULT_HTTP_TIMEOUT_NS = 600_000_000_000n;

// RFC 9110 compliant header validation
const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FIELD_VALUE_RE = /^[\t\x20-\x7E\x80-\xFF]*$/;

function validateHeaderName(name: string): void {
    if (!TOKEN_RE.test(name)) {
        throw { tag: "invalid-syntax" };
    }
}

function validateHeaderValue(value: string | Uint8Array): void {
    const str = typeof value === "string" ? value : utf8Decoder.decode(value);
    if (!FIELD_VALUE_RE.test(str)) {
        throw { tag: "invalid-syntax" };
    }
}

type FieldName = TypesNamespace.FieldName;
type FieldValue = TypesNamespace.FieldValue;

class Fields implements TypesNamespace.Fields {
    #immutable = false;
    #entries: [FieldName, FieldValue][] = [];
    #table = new Map<string, [FieldName, FieldValue][]>();

    static fromList(entries: [FieldName, FieldValue][]) {
        const fields = new Fields();
        for (const [key, value] of entries) {
            fields.append(key, value);
        }
        return fields;
    }

    get(name: FieldName) {
        const tableEntries = this.#table.get(name.toLowerCase());
        if (!tableEntries) {
            return [];
        }
        return tableEntries.map(([, v]) => v);
    }

    /**
     * WIT spec (https://github.com/WebAssembly/WASI/blob/91bb44c3c3a9b1e09187db23c85fa844d1fd6b15/proposals/http/wit/types.wit#L215-L223):
     *
     * > Set all of the values for a name. Clears any existing values for that
     * > name, if they have been set.
     * >
     * > Fails with `header-error.immutable` if the `fields` are immutable.
     * >
     * > Fails with `header-error.invalid-syntax` if the `field-name` or any of
     * > the `field-value`s are syntactically invalid.
     *
     * The existing-branch splice/reuse is an allocation optimization — values are cleared, not retained.
     */
    set(name: FieldName, values: FieldValue[]) {
        if (this.#immutable) {
            throw { tag: "immutable" };
        }
        validateHeaderName(name);
        for (const value of values) {
            validateHeaderValue(value);
        }
        const lowercased = name.toLowerCase();
        if (forbiddenHeaders.has(lowercased)) {
            throw { tag: "forbidden" };
        }
        const tableEntries = this.#table.get(lowercased);
        if (tableEntries) {
            this.#entries = this.#entries.filter((entry) => !tableEntries.includes(entry));
            tableEntries.splice(0, tableEntries.length);
        } else {
            this.#table.set(lowercased, []);
        }
        const newTableEntries = this.#table.get(lowercased)!;
        for (const value of values) {
            const entry: [FieldName, FieldValue] = [name, value];
            this.#entries.push(entry);
            newTableEntries.push(entry);
        }
    }

    has(name: string) {
        return this.#table.has(name.toLowerCase());
    }

    delete(name: string) {
        if (this.#immutable) {
            throw { tag: "immutable" };
        }
        const lowercased = name.toLowerCase();
        const tableEntries = this.#table.get(lowercased);
        if (tableEntries) {
            this.#entries = this.#entries.filter((entry) => !tableEntries.includes(entry));
            this.#table.delete(lowercased);
        }
    }

    append(name: string, value: Uint8Array) {
        if (this.#immutable) {
            throw { tag: "immutable" };
        }
        validateHeaderName(name);
        validateHeaderValue(value);
        const lowercased = name.toLowerCase();
        if (forbiddenHeaders.has(lowercased)) {
            throw { tag: "forbidden" };
        }
        const entry: [string, Uint8Array] = [name, value];
        this.#entries.push(entry);
        const tableEntries = this.#table.get(lowercased);
        if (tableEntries) {
            tableEntries.push(entry);
        } else {
            this.#table.set(lowercased, [entry]);
        }
    }

    entries() {
        return this.#entries;
    }

    clone() {
        return fieldsFromEntriesChecked(this.#entries);
    }

    static _lock(fields: Fields): Fields {
        fields.#immutable = true;
        return fields;
    }

    static _fromEntriesChecked(entries: [string, Uint8Array][]): Fields {
        const fields = new Fields();
        fields.#entries = entries;
        for (const entry of entries) {
            const lowercase = entry[0].toLowerCase();
            const existing = fields.#table.get(lowercase);
            if (existing) {
                existing.push(entry);
            } else {
                fields.#table.set(lowercase, [entry]);
            }
        }
        return fields;
    }
}
const fieldsLock = Fields._lock;
// @ts-expect-error - Deleting static method
delete Fields._lock;
const fieldsFromEntriesChecked = Fields._fromEntriesChecked;
// @ts-expect-error - Deleting static method
delete Fields._fromEntriesChecked;

class RequestOptions implements TypesNamespace.RequestOptions {
    #connectTimeout = DEFAULT_HTTP_TIMEOUT_NS;
    #firstByteTimeout = DEFAULT_HTTP_TIMEOUT_NS;
    #betweenBytesTimeout = DEFAULT_HTTP_TIMEOUT_NS;

    connectTimeout() {
        return this.#connectTimeout;
    }

    setConnectTimeout(duration: bigint) {
        if (duration < 0n) {
            throw new Error("duration must not be negative");
        }
        this.#connectTimeout = duration;
    }

    firstByteTimeout() {
        return this.#firstByteTimeout;
    }

    setFirstByteTimeout(duration: bigint) {
        if (duration < 0n) {
            throw new Error("duration must not be negative");
        }
        this.#firstByteTimeout = duration;
    }

    betweenBytesTimeout() {
        return this.#betweenBytesTimeout;
    }

    setBetweenBytesTimeout(duration: bigint) {
        if (duration < 0n) {
            throw new Error("duration must not be negative");
        }
        this.#betweenBytesTimeout = duration;
    }
}

class OutgoingBody implements TypesNamespace.OutgoingBody {
    #outputStream: any = null;
    #chunks: Uint8Array[] = [];
    #finished = false;

    write() {
        const outputStream = this.#outputStream;
        if (outputStream === null) {
            throw undefined;
        }
        this.#outputStream = null;
        return outputStream;
    }

    static finish(body: OutgoingBody, trailers?: any) {
        if (trailers) {
            throw { tag: "internal-error", val: "trailers unsupported" };
        }
        if (body.#finished) {
            throw { tag: "internal-error", val: "body already finished" };
        }
        body.#finished = true;
    }

    static _bodyData(outgoingBody: OutgoingBody): Uint8Array | null {
        if (outgoingBody.#chunks.length === 0) {
            return null;
        }
        let totalLen = 0;
        for (const chunk of outgoingBody.#chunks) {
            totalLen += chunk.byteLength;
        }
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of outgoingBody.#chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }

    static _create(): OutgoingBody {
        const outgoingBody = new OutgoingBody();
        const chunks = outgoingBody.#chunks;
        outgoingBody.#outputStream = outputStreamCreate({
            write(buf: Uint8Array): void {
                chunks.push(new Uint8Array(buf));
            },
            blockingFlush() {},
            subscribe(): any {
                return pollableCreate();
            },
        });
        return outgoingBody;
    }

    [symbolDispose]() {}
}
const outgoingBodyCreate = OutgoingBody._create;
// @ts-expect-error - Deleting static method
delete OutgoingBody._create;
const outgoingBodyData = OutgoingBody._bodyData;
// @ts-expect-error - Deleting static method
delete OutgoingBody._bodyData;

type Method = TypesNamespace.Method;
type Scheme = TypesNamespace.Scheme;

class OutgoingRequest implements TypesNamespace.OutgoingRequest {
    #method: Method = { tag: "get" };
    #scheme: Scheme | undefined = undefined;
    #pathWithQuery: string | undefined = undefined;
    #authority: string | undefined = undefined;
    #headers: Fields;
    #body: OutgoingBody;
    #bodyRequested = false;

    constructor(headers: Fields) {
        fieldsLock(headers);
        this.#headers = headers;
        this.#body = outgoingBodyCreate();
    }

    body() {
        if (this.#bodyRequested) {
            throw new Error("Body already requested");
        }
        this.#bodyRequested = true;
        return this.#body;
    }

    method() {
        return this.#method;
    }

    setMethod(method: Method) {
        if (method.tag === "other" && method.val && !method.val.match(/^[a-zA-Z-]+$/)) {
            throw undefined;
        }
        this.#method = method;
    }

    pathWithQuery() {
        return this.#pathWithQuery;
    }

    setPathWithQuery(pathWithQuery: string | undefined) {
        if (pathWithQuery && !pathWithQuery.match(/^[a-zA-Z0-9.\-_~!$&'()*+,;=:@%?/]+$/)) {
            throw undefined;
        }
        this.#pathWithQuery = pathWithQuery;
    }

    scheme() {
        return this.#scheme;
    }

    setScheme(scheme: Scheme | undefined) {
        if (scheme?.tag === "other" && scheme.val && !scheme.val.match(/^[a-zA-Z]+$/)) {
            throw undefined;
        }
        this.#scheme = scheme;
    }

    authority() {
        return this.#authority;
    }

    setAuthority(authority: string | undefined) {
        if (authority) {
            const [host, port, ...extra] = authority.split(":");
            const portNum = Number(port);
            if (
                extra.length ||
                (port !== undefined && (portNum.toString() !== port || portNum > 65535)) ||
                !host.match(/^[a-zA-Z0-9-.]+$/)
            ) {
                throw undefined;
            }
        }
        this.#authority = authority;
    }

    headers() {
        return this.#headers;
    }

    [symbolDispose]() {}

    static _handle(request: OutgoingRequest, options?: RequestOptions): FutureIncomingResponse {
        const scheme = schemeString(request.#scheme);
        const method = "val" in request.#method ? request.#method.val : request.#method.tag;

        if (!request.#pathWithQuery) {
            throw { tag: "HTTP-request-URI-invalid" };
        }

        const url = `${scheme}//${request.#authority || ""}${request.#pathWithQuery}`;

        const headers = new Headers();
        for (const [key, value] of request.#headers.entries()) {
            const lowerKey = key.toLowerCase();
            if (!forbiddenHeaders.has(lowerKey)) {
                headers.set(key, utf8Decoder.decode(value));
            }
        }

        const bodyData = outgoingBodyData(request.#body);

        let timeoutMs = Number(DEFAULT_HTTP_TIMEOUT_NS / 1_000_000n);
        if (options) {
            const ct = options.connectTimeout?.() ?? DEFAULT_HTTP_TIMEOUT_NS;
            const fbt = options.firstByteTimeout?.() ?? DEFAULT_HTTP_TIMEOUT_NS;
            const minTimeout = ct < fbt ? ct : fbt;
            timeoutMs = Number(minTimeout / 1_000_000n);
        }

        return futureIncomingResponseCreate(
            url,
            method.toUpperCase(),
            headers,
            bodyData,
            timeoutMs,
        );
    }
}
const outgoingRequestHandle = OutgoingRequest._handle;
// @ts-expect-error - Deleting static method
delete OutgoingRequest._handle;

class IncomingBody implements TypesNamespace.IncomingBody {
    #finished = false;
    #stream: any = undefined;

    stream() {
        if (!this.#stream) {
            throw undefined;
        }
        const stream = this.#stream;
        this.#stream = null;
        return stream;
    }

    static finish(incomingBody: IncomingBody) {
        if (incomingBody.#finished) {
            throw new Error("incoming body already finished");
        }
        incomingBody.#finished = true;
        return futureTrailersCreate();
    }

    [symbolDispose]() {}

    static _create(fetchResponse: Response): IncomingBody {
        const incomingBody = new IncomingBody();
        let buffer: Uint8Array | null = null;
        let bufferOffset = 0;
        let done = false;
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        let readPromise: Promise<void> | null = null;
        let readError: IoError | null = null;

        function ensureReader() {
            if (!reader && fetchResponse.body) {
                reader = fetchResponse.body.getReader();
            }
        }

        function startRead() {
            if (readPromise || done) {
                return;
            }
            ensureReader();
            if (!reader) {
                done = true;
                return;
            }
            readPromise = reader.read().then(
                (result) => {
                    readPromise = null;
                    if (result.done) {
                        done = true;
                    } else {
                        buffer = result.value;
                        bufferOffset = 0;
                    }
                },
                (cause) => {
                    readPromise = null;
                    done = true;
                    readError = ioErrorCreate(
                        cause instanceof Error ? cause.message : String(cause),
                    );
                },
            );
        }

        function checkReadError() {
            if (readError) {
                throw { tag: "last-operation-failed", val: readError };
            }
        }

        incomingBody.#stream = inputStreamCreate({
            read(len: bigint) {
                checkReadError();
                if (done && (buffer === null || bufferOffset >= buffer.byteLength)) {
                    throw { tag: "closed" };
                }
                if (buffer !== null && bufferOffset < buffer.byteLength) {
                    const available = buffer.byteLength - bufferOffset;
                    const toRead = Math.min(Number(len), available);
                    const slice = buffer.slice(bufferOffset, bufferOffset + toRead);
                    bufferOffset += toRead;
                    if (bufferOffset >= buffer.byteLength) {
                        buffer = null;
                        bufferOffset = 0;
                        if (!done) {
                            startRead();
                        }
                    }
                    return slice;
                }
                throw { tag: "would-block" };
            },
            blockingRead(len: bigint): any {
                checkReadError();
                if (done && (buffer === null || bufferOffset >= buffer.byteLength)) {
                    throw { tag: "closed" };
                }
                if (buffer !== null && bufferOffset < buffer.byteLength) {
                    const available = buffer.byteLength - bufferOffset;
                    const toRead = Math.min(Number(len), available);
                    const slice = buffer.slice(bufferOffset, bufferOffset + toRead);
                    bufferOffset += toRead;
                    if (bufferOffset >= buffer.byteLength) {
                        buffer = null;
                        bufferOffset = 0;
                        if (!done) {
                            startRead();
                        }
                    }
                    return slice;
                }
                startRead();
                const waitFor = readPromise || Promise.resolve();
                return waitFor.then(() => {
                    checkReadError();
                    if (done && (buffer === null || bufferOffset >= buffer.byteLength)) {
                        throw { tag: "closed" };
                    }
                    if (buffer !== null && bufferOffset < buffer.byteLength) {
                        const available = buffer.byteLength - bufferOffset;
                        const toRead = Math.min(Number(len), available);
                        const slice = buffer.slice(bufferOffset, bufferOffset + toRead);
                        bufferOffset += toRead;
                        if (bufferOffset >= buffer.byteLength) {
                            buffer = null;
                            bufferOffset = 0;
                            if (!done) {
                                startRead();
                            }
                        }
                        return slice;
                    }
                    throw { tag: "closed" };
                });
            },
            subscribe() {
                return pollableCreate({
                    ready: () =>
                        readError !== null ||
                        done ||
                        (buffer !== null && bufferOffset < buffer.byteLength),
                    wait: () => {
                        startRead();
                        return readPromise ?? Promise.resolve();
                    },
                });
            },
            drop() {
                done = true;
                void reader?.cancel();
            },
        });

        startRead();
        return incomingBody;
    }
}
const incomingBodyCreate = IncomingBody._create;
// @ts-expect-error - Deleting static method
delete IncomingBody._create;

class IncomingResponse implements TypesNamespace.IncomingResponse {
    #headers!: Fields;
    #status = 0;
    #body: IncomingBody | undefined;

    status() {
        return this.#status;
    }

    headers() {
        return this.#headers;
    }

    consume() {
        if (this.#body === undefined) {
            throw undefined;
        }
        const body = this.#body;
        this.#body = undefined;
        return body;
    }

    [symbolDispose]() {}

    static _create(fetchResponse: Response): IncomingResponse {
        const res = new IncomingResponse();
        res.#status = fetchResponse.status;

        const headerEntries: [string, Uint8Array][] = [];
        const encoder = new TextEncoder();
        fetchResponse.headers.forEach((value, key) => {
            headerEntries.push([key, encoder.encode(value)]);
        });
        res.#headers = fieldsLock(fieldsFromEntriesChecked(headerEntries));
        res.#body = incomingBodyCreate(fetchResponse);
        return res;
    }
}
const incomingResponseCreate = IncomingResponse._create;
// @ts-expect-error - Deleting static method
delete IncomingResponse._create;

class IncomingRequest implements TypesNamespace.IncomingRequest {
    #request!: Request;
    #headers!: Fields;
    #body: IncomingBody | undefined;

    method(): TypesNamespace.Method {
        const method = this.#request.method.toLowerCase();
        return { tag: method } as TypesNamespace.Method;
    }
    pathWithQuery() {
        const url = new URL(this.#request.url);
        return `${url.pathname}${url.search}`;
    }
    scheme(): TypesNamespace.Scheme {
        const protocol = new URL(this.#request.url).protocol;
        if (protocol === "http:") {
            return { tag: "HTTP" };
        }
        if (protocol === "https:") {
            return { tag: "HTTPS" };
        }
        return { tag: "other", val: protocol.slice(0, -1) };
    }
    authority() {
        return new URL(this.#request.url).host;
    }
    headers() {
        return this.#headers;
    }
    consume() {
        if (!this.#body) {
            throw new Error("incoming request body already consumed");
        }
        const body = this.#body;
        this.#body = undefined;
        return body;
    }
    static _create(request: Request) {
        const incoming = new IncomingRequest();
        incoming.#request = request;
        const encoder = new TextEncoder();
        incoming.#headers = fieldsLock(
            fieldsFromEntriesChecked(
                [...request.headers.entries()].map(([name, value]) => [
                    name,
                    encoder.encode(value),
                ]),
            ),
        );
        incoming.#body = incomingBodyCreate(new Response(request.body));
        return incoming;
    }
}
const incomingRequestCreate = IncomingRequest._create;
// @ts-expect-error - Deleting static method
delete IncomingRequest._create;

class OutgoingResponse implements TypesNamespace.OutgoingResponse {
    #headers: Fields;
    #status = 200;
    #body = outgoingBodyCreate();
    #bodyRequested = false;

    constructor(headers: Fields) {
        fieldsLock(headers);
        this.#headers = headers;
    }
    statusCode() {
        return this.#status;
    }
    setStatusCode(statusCode: number) {
        if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 999) {
            throw new TypeError("invalid HTTP status code");
        }
        this.#status = statusCode;
    }
    headers() {
        return this.#headers;
    }
    body() {
        if (this.#bodyRequested) {
            throw new Error("outgoing response body already requested");
        }
        this.#bodyRequested = true;
        return this.#body;
    }
    static _toResponse(response: OutgoingResponse) {
        const headers = new Headers();
        for (const [name, value] of response.#headers.entries()) {
            headers.append(name, utf8Decoder.decode(value));
        }
        return new Response(outgoingBodyData(response.#body) as BodyInit | null, {
            status: response.#status,
            headers,
        });
    }
}
const outgoingResponseToResponse = OutgoingResponse._toResponse;
// @ts-expect-error - Deleting static method
delete OutgoingResponse._toResponse;

class ResponseOutparam implements TypesNamespace.ResponseOutparam {
    #used = false;
    #resolve!: (response: Response) => void;

    static set(
        param: ResponseOutparam,
        response: Result<TypesNamespace.OutgoingResponse, TypesNamespace.ErrorCode>,
    ) {
        if (param.#used) {
            throw new Error("response outparam already set");
        }
        param.#used = true;
        if (response.tag === "ok") {
            param.#resolve(outgoingResponseToResponse(response.val as OutgoingResponse));
        } else {
            param.#resolve(new Response("WASI HTTP handler error", { status: 500 }));
        }
    }

    static _create(): [ResponseOutparam, Promise<Response>] {
        const param = new ResponseOutparam();
        const response = new Promise<Response>((resolve) => (param.#resolve = resolve));
        return [param, response];
    }
}
const responseOutparamCreate = ResponseOutparam._create;
// @ts-expect-error - Deleting static method
delete ResponseOutparam._create;

class FutureTrailers implements TypesNamespace.FutureTrailers {
    #requested = false;

    subscribe(): any {
        return pollableCreate();
    }

    get():
        | Result<Result<TypesNamespace.Trailers | undefined, TypesNamespace.ErrorCode>, void>
        | undefined {
        if (this.#requested) {
            return { tag: "err", val: undefined };
        }
        this.#requested = true;
        return {
            tag: "ok",
            val: {
                tag: "ok",
                val: fieldsLock(fieldsFromEntriesChecked([])),
            },
        };
    }

    static _create(): FutureTrailers {
        return new FutureTrailers();
    }
}
const futureTrailersCreate = FutureTrailers._create;
// @ts-expect-error - Deleting static method
delete FutureTrailers._create;

function mapFetchError(err: Error) {
    if (err.name === "AbortError") {
        return { tag: "connection-timeout" };
    }
    return { tag: "internal-error", val: err.message };
}

class FutureIncomingResponse implements TypesNamespace.FutureIncomingResponse {
    #result: any = undefined;
    #promise: Promise<void> | null = null;
    #controller: AbortController | null = null;

    subscribe(): Pollable {
        return pollableCreate(this.#promise!);
    }

    get() {
        if (this.#result === undefined) {
            return undefined;
        }
        const result = this.#result;
        this.#result = { tag: "err" };
        return result;
    }

    [symbolDispose]() {
        this.#controller?.abort();
        this.#controller = null;
        this.#promise = null;
    }

    static _create(
        url: string,
        method: string,
        headers: Headers,
        bodyData: Uint8Array | null,
        timeoutMs: number,
    ): FutureIncomingResponse {
        const future = new FutureIncomingResponse();

        const controller = new AbortController();
        future.#controller = controller;
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (timeoutMs < Infinity) {
            timer = setTimeout(() => controller.abort(), timeoutMs);
        }

        const init: RequestInit = {
            method,
            headers,
            signal: controller.signal,
        };
        if (bodyData && method !== "GET" && method !== "HEAD") {
            init.body = bodyData as BodyInit;
        }

        future.#promise = fetch(url, init).then(
            (response) => {
                if (timer) {
                    clearTimeout(timer);
                }
                future.#result = {
                    tag: "ok",
                    val: {
                        tag: "ok",
                        val: incomingResponseCreate(response),
                    },
                };
            },
            (err) => {
                if (timer) {
                    clearTimeout(timer);
                }
                future.#result = {
                    tag: "ok",
                    val: {
                        tag: "err",
                        val: mapFetchError(err),
                    },
                };
            },
        );

        return future;
    }
}
const futureIncomingResponseCreate = FutureIncomingResponse._create;
// @ts-expect-error - Deleting static method
delete FutureIncomingResponse._create;

function schemeString(scheme: Scheme | undefined): string {
    if (!scheme) {
        return "https:";
    }
    switch (scheme.tag) {
        case "HTTP":
            return "http:";
        case "HTTPS":
            return "https:";
        case "other":
            return scheme.val!.toLowerCase() + ":";
    }
    return "https:";
}

function httpErrorCode(err: IoError): TypesNamespace.ErrorCode | undefined {
    if ("payload" in err) {
        return err.payload as TypesNamespace.ErrorCode;
    }
    return {
        tag: "internal-error",
        val: "message" in err ? (err.message as string) : err.toDebugString(),
    };
}

export const outgoingHandler: typeof OutgoingHandlerNamespace = {
    // @ts-expect-error Not matching signature in WIT
    handle: outgoingRequestHandle,
};

export const incomingHandler: typeof IncomingHandlerNamespace = {
    handle() {
        throw "not-supported";
    },
};

export type BrowserIncomingHandler = (
    request: TypesNamespace.IncomingRequest,
    responseOut: TypesNamespace.ResponseOutparam,
) => void | Promise<void>;

/** Translate a browser Request through a host-provided WASI incoming handler. */
export async function handleIncomingRequest(
    request: Request,
    handler: BrowserIncomingHandler,
): Promise<Response> {
    const [responseOut, response] = responseOutparamCreate();
    await handler(incomingRequestCreate(request), responseOut);
    return response;
}

export const types: typeof TypesNamespace = {
    Fields,
    FutureIncomingResponse,
    FutureTrailers,
    IncomingBody,
    IncomingRequest,
    IncomingResponse,
    OutgoingBody,
    OutgoingRequest,
    OutgoingResponse,
    ResponseOutparam,
    RequestOptions,
    httpErrorCode,
};

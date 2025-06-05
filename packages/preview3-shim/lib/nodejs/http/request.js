import { HttpError } from './error.js';
import { _fieldsLock, Fields } from './fields.js';

import { FutureReader, future } from '../future.js';
import { StreamReader } from '../stream.js';

const REQUEST_PRIV_SYM = Symbol('RequestPrivSym');

export class RequestOptions {
    #connectTimeout = null;
    #firstByteTimeout = null;
    #betweenBytesTimeout = null;
    #immutable = false;

    /**
     * Construct a default ~RequestOptions~ value.
     * WIT:
     * ```
     * constructor()
     * ```
     */
    constructor() {}

    /**
     * The timeout for the initial connect to the HTTP Server.
     * WIT:
     * ```
     * connect-timeout: func() -> option<duration>
     * ```
     *
     * @returns {?number} Duration in milliseconds, or `null` if not set
     */
    connectTimeout() {
        return this.#connectTimeout;
    }

    /**
     * Set the timeout for the initial connect to the HTTP Server.
     * WIT:
     * ```
     * set-connect-timeout: func(duration: option<duration>) -> result<_, request-options-error>
     * ```
     *
     * @param {?number} duration Duration in milliseconds, or `null` to clear
     * @throws {HttpError} with payload.tag 'immutable' if this handle is immutable
     */
    setConnectTimeout(duration) {
        this._ensureMutable();
        this.#connectTimeout = duration;
    }

    /**
     * The timeout for receiving the first byte of the Response body.
     * WIT:
     * ```
     * first-byte-timeout: func() -> option<duration>
     * ```
     *
     * @returns {?number} Duration in milliseconds, or `null` if not set
     */
    firstByteTimeout() {
        return this.#firstByteTimeout;
    }

    /**
     * Set the timeout for receiving the first byte of the Response body.
     * WIT:
     * ```
     * set-first-byte-timeout: func(duration: option<duration>) -> result<_, request-options-error>
     * ```
     *
     * @param {?number} duration Duration in milliseconds, or `null` to clear
     * @throws {HttpError} with payload.tag 'immutable' if this handle is immutable
     */
    setFirstByteTimeout(duration) {
        this._ensureMutable();
        this.#firstByteTimeout = duration;
    }

    /**
     * The timeout for receiving subsequent chunks of bytes in the Response body.
     * WIT:
     * ```
     * between-bytes-timeout: func() -> option<duration>
     * ```
     *
     * @returns {?number} Duration in milliseconds, or `null` if not set
     */
    betweenBytesTimeout() {
        return this.#betweenBytesTimeout;
    }

    /**
     * Set the timeout for receiving subsequent chunks of bytes in the Response body.
     * WIT:
     * ```
     * set-between-bytes-timeout: func(duration: option<duration>) -> result<_, request-options-error>
     * ```
     *
     * @param {?number} duration Duration in milliseconds, or `null` to clear
     * @throws {HttpError} with payload.tag 'immutable' if this handle is immutable
     */
    setBetweenBytesTimeout(duration) {
        this._ensureMutable();
        this.#betweenBytesTimeout = duration;
    }

    /**
     * Make a deep copy of the ~RequestOptions~.
     * WIT:
     * ```
     * clone: func() -> request-options
     * ```
     *
     * @returns {RequestOptions} A new mutable copy
     */
    clone() {
        const cloned = new RequestOptions();
        cloned.#connectTimeout = this.#connectTimeout;
        cloned.#firstByteTimeout = this.#firstByteTimeout;
        cloned.#betweenBytesTimeout = this.#betweenBytesTimeout;
        return cloned;
    }

    /**
     * Mark options as immutable
     *
     * @param {RequestOptions} opts - The RequestOptions instance to mark as immutable
     * @returns {RequestOptions} The same instance, now immutable
     */
    static _lock(fields) {
        if (fields) {
            fields.#immutable = true;
        }
        return fields;
    }

    _ensureMutable() {
        if (this.#immutable) {
            throw new HttpError(
                'immutable',
                'Cannot modify immutable RequestOptions'
            );
        }
    }
}

export const _optionsLock = RequestOptions._lock;
delete RequestOptions._lock;

export class Request {
    #method = 'get';
    #headers = null;
    #contents = null;
    #options = null;
    #scheme = null;
    #authority = null;
    #pathWithQuery = null;
    #trailersFuture = null;
    #requestFuture = null;

    constructor(token) {
        if (token !== REQUEST_PRIV_SYM) {
            throw new Error('Use Request.new(...) to create a Request');
        }
    }

    /**
     * Construct a new Request with default values.
     *
     * WIT:
     * ```
     * new: static func(
     *   headers: headers,
     *   contents: option<stream<u8>>,
     *   trailers: future<result<option<trailers>, error-code>>,
     *   options: option<request-options>
     * ) -> tuple<request, future<result<_, error-code>>>;
     * ```
     *
     * @param {Fields} headers  immutable headers resource
     * @param {?StreamReader} contents  optional body stream
     * @param {FutureReader} trailers  future for trailers
     * @param {?RequestOptions} options  optional RequestOptions
     * @returns {{ req: Request, future: FutureReader }}
     * @throws {HttpError} with payload.tag 'invalid-argument' for invalid arguments
     *
     */
    static new(headers, contents, trailers, options) {
        if (options != null && !(options instanceof RequestOptions)) {
            throw new HttpError(
                'invalid-argument',
                'options must be RequestOptions'
            );
        }

        if (!(headers instanceof Fields)) {
            throw new HttpError('invalid-argument', 'headers must be Fields');
        }

        if (contents != null && !(contents instanceof StreamReader)) {
            throw new HttpError(
                'invalid-argument',
                'contents must be StreamReader'
            );
        }

        if (!(trailers instanceof FutureReader)) {
            throw new HttpError(
                'invalid-argument',
                'trailers must be FutureReader'
            );
        }

        let request = new Request(REQUEST_PRIV_SYM);
        request.#headers = headers;
        request.#contents = contents;
        request.#options = options;
        request.#trailersFuture = trailers;
        request.#pathWithQuery = null;
        request.#scheme = null;
        request.#authority = null;

        _fieldsLock(request.#headers);
        _optionsLock(request.#options);

        const { tx, rx } = future();
        request.#requestFuture = tx;

        return { req: request, future: rx };
    }

    /**
     * Get the Method for the Request.
     *
     * WIT:
     * ```
     * method: func() -> method;
     * ```
     *
     * @returns {method}
     */
    method() {
        return this.#method;
    }

    /**
     * Set the Method for the Request.
     *
     * WIT:
     * ```
     * set-method: func(method: method) -> result;
     * ```
     *
     * @param {method} method
     * @throws {HttpError} with payload.tag 'invalid-syntax' if method is invalid
     */
    setMethod(method) {
        const VALUE_TOKEN_RE = /^[a-zA-Z-]+$/;

        if (typeof method !== 'string' || !VALUE_TOKEN_RE.test(method)) {
            throw new HttpError('invalid-syntax');
        }

        const lowercase = method.toLowerCase();
        if (supportedMethods.includes(lowercase)) {
            this.#method = { tag: lowercase };
        } else {
            this.#method = { tag: 'other', val: lowercase };
        }
    }

    /**
     * Get the HTTP Path and Query.
     *
     * WIT:
     * ```
     * path-with-query: func() -> option<string>;
     * ```
     *
     * @returns {?string}
     */
    pathWithQuery() {
        return this.#pathWithQuery;
    }

    /**
     * Set the HTTP Path and Query.
     *
     * WIT:
     * ```
     * set-path-with-query: func(path-with-query: option<string>) -> result;
     * ```
     *
     * @param {?string} pathWithQuery
     * @throws {HttpError} with payload.tag 'invalid-syntax' if invalid URI component
     */
    setPathWithQuery(pathWithQuery) {
        if (pathWithQuery != null) {
            try {
                new URL(pathWithQuery, 'http://example');
            } catch {
                throw new HttpError(
                    'invalid-syntax',
                    `Invalid path-with-query: ${pathWithQuery}`
                );
            }
        }

        this.#pathWithQuery = pathWithQuery;
    }

    /**
     * Get the HTTP Scheme.
     *
     * WIT:
     * ```
     * scheme: func() -> option<scheme>;
     * ```
     *
     * @returns {?scheme}
     */
    scheme() {
        return this.#scheme;
    }

    /**
     * Set the HTTP Scheme.
     *
     * WIT:
     * ```
     * set-scheme: func(scheme: option<scheme>) -> result;
     * ```
     *
     * @param {?scheme} scheme
     * @throws {HttpError} with payload.tag 'invalid-syntax' if invalid scheme
     */
    setScheme(scheme) {
        if (scheme != null) {
            try {
                new URL(`${scheme}://example`);
            } catch {
                throw new HttpError(
                    'invalid-syntax',
                    `Invalid scheme: ${scheme}`
                );
            }
        }
        this.#scheme = scheme;
    }

    /**
     * Get the authority for the target URI.
     *
     * WIT:
     * ```
     * authority: func() -> option<string>;
     * ```
     *
     * @returns {?string}
     */
    authority() {
        return this.#authority;
    }

    /**
     * Set the authority for the target URI.
     *
     * WIT:
     * ```
     * set-authority: func(authority: option<string>) -> result;
     * ```
     *
     * @param {?string} authority
     * @throws {HttpError} with payload.tag 'invalid-syntax' if invalid authority
     */
    setAuthority(authority) {
        if (authority != null) {
            try {
                new URL(`http://${authority}`);
            } catch {
                throw new HttpError(
                    'invalid-syntax',
                    `Invalid authority: ${authority}`
                );
            }
        }
        this.#authority = authority;
    }

    /**
     * Get the associated request-options resource.
     *
     * WIT:
     * ```
     * options: func() -> option<request-options>;
     * ```
     *
     * @returns {?RequestOptions}
     */
    options() {
        return this.#options;
    }

    /**
     * Get the headers resource (immutable).
     *
     * WIT:
     * ```
     * headers: func() -> headers;
     * ```
     *
     * @returns {Fields}
     */
    headers() {
        return this.#headers;
    }

    /**
     * Get the body stream and trailers future.
     *
     * WIT:
     * ```
     * body: func() -> result<tuple<stream<u8>, future<result<option<trailers>, error-code>>>>;
     * ```
     *
     * @returns {{ req: StreamReader, trailers: FutureReader }}
     * @throws {HttpError} with payload.tag 'invalid-state' if body already open
     */
    body() {
        // TODO: enforce single-stream semantics
        return { body: this.#contents, trailers: this.#trailersFuture };
    }

    // TODO: placeholder
    _resolve(result) {
        if (this.#requestFuture) {
            this.#requestFuture.write(result);
            this.#requestFuture = null;
        }
    }
}

const supportedMethods = [
    'get',
    'head',
    'post',
    'put',
    'delete',
    'connect',
    'options',
    'trace',
    'patch',
];

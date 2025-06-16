import { FutureReader, future } from '../future.js';
import { StreamReader } from '../stream.js';
import { HttpError } from './error.js';
import { Fields, _fieldsLock } from './fields.js';

let RESPONSE_CREATE_TOKEN = null;
function token() {
    return (RESPONSE_CREATE_TOKEN ??= Symbol('ResponseCreateToken'));
}

export class Response {
    #statusCode = 200;
    #headers = null;
    #contents = null;
    #trailersFuture = null;
    #responseFuture = null;
    #bodyOpen = false;
    #bodyEnded = false;

    /**
     * @private
     * Use Response.new(...) to create an instance
     */
    constructor(t) {
        if (t !== token()) {
            throw new Error('Use Response.new(...) to create a Response');
        }
    }

    /**
     * Construct a new Response with default status-code 200.
     *
     * WIT:
     * ```
     * new: static func(
     *   headers: headers,
     *   contents: option<stream<u8>>,
     *   trailers: future<result<option<trailers>, error-code>>
     * ) -> tuple<response, future<result<_, error-code>>>;
     * ```
     *
     * @param {Fields} headers  immutable headers resource
     * @param {?StreamReader} contents  optional body stream
     * @param {FutureReader} trailers  future for trailers
     * @returns {{ res: Response, future: FutureReader }}
     * @throws {HttpError} with payload.tag 'invalid-argument' for invalid arguments
     */
    static new(headers, contents, trailers) {
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

        const response = new Response(token());
        response.#headers = _fieldsLock(headers);
        response.#contents = contents;
        response.#trailersFuture = trailers;

        const { tx, rx } = future();
        response.#responseFuture = tx;

        return { res: response, future: rx };
    }

    /**
     * Get the HTTP Status Code for the Response.
     *
     * WIT:
     * ```
     * status-code: func() -> status-code;
     * ```
     *
     * @returns {number}
     */
    statusCode() {
        return this.#statusCode;
    }

    /**
     * Set the HTTP Status Code for the Response.
     *
     * WIT:
     * ```
     * set-status-code: func(status-code: status-code) -> result;
     * ```
     *
     * @param {number} code
     * @throws {HttpError} with payload.tag 'invalid-argument'
     *   if code is not an integer in [100,599]
     */
    setStatusCode(code) {
        if (
            typeof code !== 'number' ||
            !Number.isInteger(code) ||
            code < 100 ||
            code > 599
        ) {
            throw new HttpError(
                'invalid-argument',
                `Invalid status code: ${code}`
            );
        }
        this.#statusCode = code;
    }

    /**
     * Get the headers associated with the Response.
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
     * @returns {{ body: StreamReader, trailers: FutureReader }}
     * @throws {HttpError} with payload.tag 'invalid-state' if body has already been opened or consumed.
     */
    body() {
        if (this.#bodyOpen) {
            throw new HttpError(
                'invalid-state',
                'body() already opened and not yet closed'
            );
        }

        if (this.#bodyEnded) {
            throw new HttpError(
                'invalid-state',
                'body() has already been consumed'
            );
        }

        if (!this.#contents) {
            this.#bodyEnded = true;
            return { body: this.#contents, trailers: this.#trailersFuture };
        }

        const reader = this.#contents;
        this.#bodyOpen = true;

        const readFn = reader.read.bind(reader);
        reader.read = () => {
            const chunk = readFn();
            if (chunk === null) {
                this.#bodyEnded = true;
                this.#bodyOpen = false;
            }

            return chunk;
        };

        const closedFn = reader.close.bind(reader);
        reader.close = () => {
            closedFn();
            this.#bodyEnded = true;
            this.#bodyOpen = false;
        };

        return { body: this.#contents, trailers: this.#trailersFuture };
    }

    // Internal: call to complete the response transmission
    _resolve(result) {
        if (this.#responseFuture) {
            this.#responseFuture.write(result);
            this.#responseFuture = null;
        }
    }
}

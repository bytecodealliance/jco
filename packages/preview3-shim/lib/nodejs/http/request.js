import { HttpError } from './error.js';

const defaultHttpTimeout = 600_000_000_000n;

export class RequestOptions {
    #connectTimeout = null;
    #firstByteTimeout = null;
    #betweenBytesTimeout = null;
    #immutable = false;

    /**
     * Construct a default ~RequestOptions~ value.
     * WIT: constructor()
     */
    constructor() {}

    /**
     * The timeout for the initial connect to the HTTP Server.
     * WIT: connect-timeout: func() -> option<duration>
     *
     * @returns {?number} Duration in milliseconds, or `null` if not set
     */
    connectTimeout() {
        return this.#connectTimeout;
    }

    /**
     * Set the timeout for the initial connect to the HTTP Server.
     * WIT: set-connect-timeout: func(duration: option<duration>) -> result<_, request-options-error>
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
     * WIT: first-byte-timeout: func() -> option<duration>
     *
     * @returns {?number} Duration in milliseconds, or `null` if not set
     */
    firstByteTimeout() {
        return this.#firstByteTimeout;
    }

    /**
     * Set the timeout for receiving the first byte of the Response body.
     * WIT: set-first-byte-timeout: func(duration: option<duration>) -> result<_, request-options-error>
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
     * WIT: between-bytes-timeout: func() -> option<duration>
     *
     * @returns {?number} Duration in milliseconds, or `null` if not set
     */
    betweenBytesTimeout() {
        return this.#betweenBytesTimeout;
    }

    /**
     * Set the timeout for receiving subsequent chunks of bytes in the Response body.
     * WIT: set-between-bytes-timeout: func(duration: option<duration>) -> result<_, request-options-error>
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
     * WIT: clone: func() -> request-options
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

    _ensureMutable() {
        if (this.#immutable) {
            throw new HttpError(
                'immutable',
                'Cannot modify immutable RequestOptions'
            );
        }
    }
}

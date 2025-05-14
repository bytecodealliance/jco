/**
 * Custom error class for WASI http interface that properly formats payload for Jco compatibility
 *
 * https://bytecodealliance.github.io/jco/wit-type-representations.html#result-considerations-idiomatic-js-errors-for-host-implementations
 */
export class HttpError extends Error {
    /**
     * Create a new WASI error
     * @param {string} tag - The error tag/type
     * @param {string} [message] - Human-readable error message
     * @param {any} [val] - Optional value/data for the error
     */
    constructor(tag, message, val) {
        super(message || `Error: ${tag}`);
        this.name = 'HttpError';
        this.payload = val !== undefined ? { tag, val } : { tag };
    }
}

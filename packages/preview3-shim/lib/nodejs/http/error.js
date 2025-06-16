/**
 * Custom error class for WASI http interface that properly formats payload for Jco compatibility
 *
 * https://bytecodealliance.github.io/jco/wit-type-representations.html#result-considerations-idiomatic-js-errors-for-host-implementations
 */
export class HttpError extends Error {
    /**
     * Create a new WASI http error
     * @param {string} tag - The error tag/type
     * @param {string} [message] - Human-readable error message
     * @param {any} [val] - Optional value/data for the error
     */
    constructor(tag, message, val, opts = {}) {
        super(message || `Error: ${tag}`, { cause: opts.cause });
        this.name = 'HttpError';
        this.payload = val !== undefined ? { tag, val } : { tag };
    }

    static from(err) {
        if (err instanceof HttpError) {
            return err;
        }

        if (err?.tag) {
            return new HttpError(err.tag, undefined, err.val);
        }

        const e = getFirstError(err);
        let tag, val;

        switch (e.code) {
            case 'ECONNRESET':
                tag = 'HTTP-protocol-error';
                break;

            case 'ENOTFOUND':
                tag = 'DNS-error';
                val = {
                    rcode: e.code,
                    infoCode: e.errno < 0 ? -e.errno : e.errno,
                };
                break;

            case 'ECONNREFUSED':
                tag = 'connection-refused';
                break;

            default:
                tag = 'internal-error';
                val = e.toString();
        }

        const httpErr = new HttpError(tag, e.message, val, { cause: e });
        Error.captureStackTrace(httpErr, HttpError.from);

        return httpErr;
    }
}

function getFirstError(e) {
    if (typeof e !== 'object' || e === null) {
        return e;
    }
    if (e.cause) {
        return getFirstError(e.cause);
    }
    if (e instanceof AggregateError) {
        return getFirstError(e.errors[0]);
    }
    return e;
}

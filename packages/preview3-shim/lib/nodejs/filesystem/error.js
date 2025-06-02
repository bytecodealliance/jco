export const ERROR_MAP = {
    EACCES: 'access',
    EALREADY: 'already',
    EBADF: 'bad-descriptor',
    EBUSY: 'busy',
    EDEADLK: 'deadlock',
    EDQUOT: 'quota',
    EEXIST: 'exist',
    EFBIG: 'file-too-large',
    EILSEQ: 'illegal-byte-sequence',
    EINPROGRESS: 'in-progress',
    EINTR: 'interrupted',
    EINVAL: 'invalid',
    EIO: 'io',
    EISDIR: 'is-directory',
    ELOOP: 'loop',
    EMLINK: 'too-many-links',
    EMSGSIZE: 'message-size',
    ENAMETOOLONG: 'name-too-long',
    ENODEV: 'no-device',
    ENOENT: 'no-entry',
    ENOLCK: 'no-lock',
    ENOMEM: 'insufficient-memory',
    ENOSPC: 'insufficient-space',
    ENOTDIR: 'not-directory',
    ERR_FS_EISDIR: 'not-directory',
    ENOTEMPTY: 'not-empty',
    ENOTRECOVERABLE: 'not-recoverable',
    ENOTSUP: 'unsupported',
    ENOTTY: 'no-tty',
    ENXIO: 'no-such-device',
    EOVERFLOW: 'overflow',
    EPERM: 'not-permitted',
    EPIPE: 'pipe',
    EROFS: 'read-only',
    ESPIPE: 'invalid-seek',
    ETXTBSY: 'text-file-busy',
    EXDEV: 'cross-device',
};

function mapError(e) {
    if (e.code in ERROR_MAP) {
        return ERROR_MAP[e.code];
    }

    if (e.code === -4094 || (e.code === 'UNKNOWN' && e.errno === -4094)) {
        return 'no-such-device';
    }

    throw e;
}

/**
 * Custom error for File operations with JCO compatible payload.
 */
export class FsError extends Error {
    /**
     * @param {string} tag        – machine‐readable error tag
     * @param {string} [message]  – human‐readable message
     * @param {any}    [val]      – optional extra data
     */
    constructor(tag, message, val, opts = {}) {
        super(message ?? `Error: ${tag}`, { cause: opts.cause });
        this.name = 'FsError';
        this.payload = val !== undefined ? { tag, val } : { tag };
    }

    /**
     * Create or rewrap an error into SocketError
     * @param {any} err – number, string, Error, or SocketError
     */
    static from(err) {
        if (err instanceof FsError) return err;

        const tag = mapError(err);
        const message = err?.message;
        return new FsError(tag, message, undefined, { cause: err });
    }
}

export const types = {
    filesystemErrorCode(err) {
        return mapError(err.payload);
    },
};

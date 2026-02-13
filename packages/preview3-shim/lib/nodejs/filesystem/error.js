export const ERROR_MAP = {
  EACCES: "access",
  EALREADY: "already",
  EBADF: "bad-descriptor",
  EBUSY: "busy",
  EDEADLK: "deadlock",
  EDQUOT: "quota",
  EEXIST: "exist",
  EFBIG: "file-too-large",
  EILSEQ: "illegal-byte-sequence",
  EINPROGRESS: "in-progress",
  EINTR: "interrupted",
  EINVAL: "invalid",
  EIO: "io",
  EISDIR: "is-directory",
  ELOOP: "loop",
  EMLINK: "too-many-links",
  EMSGSIZE: "message-size",
  ENAMETOOLONG: "name-too-long",
  ENODEV: "no-device",
  ENOENT: "no-entry",
  ENOLCK: "no-lock",
  ENOMEM: "insufficient-memory",
  ENOSPC: "insufficient-space",
  ENOTDIR: "not-directory",
  ERR_FS_EISDIR: "not-directory",
  ENOTEMPTY: "not-empty",
  ENOTRECOVERABLE: "not-recoverable",
  ENOTSUP: "unsupported",
  ENOTTY: "no-tty",
  ENXIO: "no-such-device",
  EOVERFLOW: "overflow",
  EPERM: "not-permitted",
  EPIPE: "pipe",
  EROFS: "read-only",
  ESPIPE: "invalid-seek",
  ETXTBSY: "text-file-busy",
  EXDEV: "cross-device",
};

function getErrorTag(e) {
  if (e.code in ERROR_MAP) {
    return ERROR_MAP[e.code];
  }

  // Windows gives this error for badly structured `//` reads, this seems like
  // a slightly better error than unknown given that it's a common footgun.
  if (e.code === -4094 || (e.code === "UNKNOWN" && e.errno === -4094)) {
    return "no-such-device";
  }

  throw e;
}

/**
 * Custom error for File operations with JCO compatible payload.
 */
export class FSError extends Error {
  /**
   * @param {string} tag        – machine‐readable error tag
   * @param {string} [message]  – human‐readable message
   * @param {any}    [val]      – optional extra data
   * @param {object} [opts]
   * @param {Error} [opts.cause]
   */
  constructor(tag, message, val, opts = {}) {
    super(message ?? `Error: ${tag}`, { cause: opts.cause });
    this.name = "FSError";
    this.payload = val !== undefined ? { tag, val } : { tag };
  }

  /**
   * Create or rewrap an error into FSError
   * @param {any} err – number, string, Error, or FSError
   */
  static from(err) {
    if (err instanceof FSError) {
      return err;
    }

    const tag = getErrorTag(err);
    const message = err?.message;
    return new FSError(tag, message, undefined, { cause: err });
  }
}

export function filesystemErrorCode(err) {
  return getErrorTag(err.payload);
}

export const ERROR_MAP = {
  EACCES: "access-denied",
  EPERM: "access-denied",
  EOPNOTSUPP: "not-supported",
  ENOPROTOOPT: "not-supported",
  EPFNOSUPPORT: "not-supported",
  EPROTONOSUPPORT: "not-supported",
  ESOCKTNOSUPPORT: "not-supported",
  EINVAL: "invalid-argument",
  EAFNOSUPPORT: "invalid-argument",
  ENOMEM: "out-of-memory",
  ENOBUFS: "out-of-memory",
  ETIMEDOUT: "timeout",
  EADDRINUSE: "address-in-use",
  EADDRNOTAVAIL: "address-not-bindable",
  EHOSTUNREACH: "remote-unreachable",
  EHOSTDOWN: "remote-unreachable",
  ENETUNREACH: "remote-unreachable",
  ENETDOWN: "remote-unreachable",
  ENONET: "remote-unreachable",
  ECONNREFUSED: "connection-refused",
  EPIPE: "connection-broken",
  ECONNRESET: "connection-reset",
  ECONNABORTED: "connection-aborted",
  EMSGSIZE: "datagram-too-large",
  ENOTCONN: "invalid-state",
  EISCONN: "invalid-state",
  EALREADY: "invalid-state",
  EDESTADDRREQ: "invalid-argument",
};

export const CODE_MAP = {
  4053: "invalid-state",
  4083: "invalid-state",
  ENOTCONN: "invalid-state",
  EBADF: "invalid-state",
  EACCES: "access-denied",
  EPERM: "access-denied",
  ENOTSUP: "not-supported",
  EOPNOTSUPP: "not-supported",
  ENOPROTOOPT: "not-supported",
  EPFNOSUPPORT: "not-supported",
  EPROTONOSUPPORT: "not-supported",
  ESOCKTNOSUPPORT: "not-supported",
  EINVAL: "invalid-argument",
  EAFNOSUPPORT: "invalid-argument",
  ENOMEM: "out-of-memory",
  ENOBUFS: "out-of-memory",
  4090: "address-not-bindable",
  EADDRNOTAVAIL: "address-not-bindable",
  4091: "address-in-use",
  EADDRINUSE: "address-in-use",
  EHOSTUNREACH: "remote-unreachable",
  EHOSTDOWN: "remote-unreachable",
  ENETUNREACH: "remote-unreachable",
  ENETDOWN: "remote-unreachable",
  ENONET: "remote-unreachable",
  ECONNREFUSED: "connection-refused",
  EPIPE: "connection-broken",
  ECONNRESET: "connection-reset",
  ECONNABORTED: "connection-aborted",
  EMSGSIZE: "datagram-too-large",
};

/**
 * Custom error for Socket operations with JCO compatible payload.
 *
 * https://bytecodealliance.github.io/jco/wit-type-representations.html#result-considerations-idiomatic-js-errors-for-host-implementations
 */
export class SocketError extends Error {
  /**
   * @param {string} tag        – machine‐readable error tag
   * @param {string} [message]  – human‐readable message
   * @param {any}    [val]      – optional extra data
   */
  constructor(tag, message, val, opts = {}) {
    super(message ?? `Error: ${tag}`, { cause: opts.cause });
    this.name = "SocketError";
    this.payload = val !== undefined ? { tag, val } : { tag };
  }

  /**
   * Create or rewrap an error into SocketError
   * @param {any} err – number, string, Error, or SocketError
   */
  static from(err) {
    if (err instanceof SocketError) {
      return err;
    }

    let tag,
      message = undefined,
      val = undefined;

    if (typeof err === "number") {
      tag = CODE_MAP[err] ?? "other";
      message = `Error code ${err}`;
      if (tag === "other") {
        val = message;
      }
    } else if (typeof err === "string") {
      tag = ERROR_MAP[err] ?? "other";
      if (tag === "other") {
        val = err;
      }
    } else if (err && typeof err.code === "string") {
      tag = ERROR_MAP[err.code] ?? "other";
      message = err.message;
      if (tag === "other") {
        val = err.code;
      }
    } else if (err && typeof err.message === "string" && ERROR_MAP[err.message]) {
      tag = ERROR_MAP[err.message];
      message = err.message;
    } else {
      tag = "other";
      message = err?.message;
      val = message;
    }

    return new SocketError(tag, message, val);
  }
}

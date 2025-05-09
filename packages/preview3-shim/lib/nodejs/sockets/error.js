export const ERROR_MAP = {
  EACCES: "access-denied",
  EPERM: "access-denied",
  EOPNOTSUPP: "not-supported",
  EINVAL: "invalid-argument",
  ENOMEM: "out-of-memory",
  ENOBUFS: "out-of-memory",
  EAI_MEMORY: "out-of-memory",
  ETIMEDOUT: "timeout",
  EADDRINUSE: "address-in-use",
  EADDRNOTAVAIL: "address-not-bindable",
  EHOSTUNREACH: "remote-unreachable",
  ENETUNREACH: "remote-unreachable",
  ENETDOWN: "remote-unreachable",
  ECONNREFUSED: "connection-refused",
  ECONNRESET: "connection-reset",
  ECONNABORTED: "connection-aborted",
  EMSGSIZE: "datagram-too-large",
  ENOTCONN: "invalid-state",
  EISCONN: "invalid-state",
  EALREADY: "invalid-state",
  EDESTADDRREQ: "invalid-argument",
};

/**
 * Maps system error codes to standardized error strings
 * @param {string|Error} err - The error to map
 * @returns {string} The mapped error code
 */
export function mapError(err) {
  if (typeof err === "string") {
    return ERROR_MAP[err] || err;
  }

  if (err && typeof err.code === "string") {
    return ERROR_MAP[err.code] || err.code;
  }

  return "unknown";
}

export const CODE_MAP = {
  4053: "invalid-state",
  4083: "invalid-state",
  ENOTCONN: "invalid-state",
  EBADF: "invalid-state",
  EACCES: "access-denied",
  EPERM: "access-denied",
  ENOTSUP: "not-supported",
  EINVAL: "invalid-argument",
  ENOMEM: "out-of-memory",
  ENOBUFS: "out-of-memory",
  EALREADY: "concurrency-conflict",
  EWOULDBLOCK: "would-block",
  4090: "address-not-bindable",
  EADDRNOTAVAIL: "address-not-bindable",
  4091: "address-in-use",
  EADDRINUSE: "address-in-use",
  ECONNREFUSED: "connection-refused",
  ECONNRESET: "connection-reset",
  ECONNABORTED: "connection-aborted",
};

export function mapErrorCode(code) {
  return CODE_MAP[code] ?? "unknown";
}

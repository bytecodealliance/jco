import { HttpError } from "./error.js";
import { _fieldsLock, Fields } from "./fields.js";

import { FutureReader, future } from "../future.js";
import {
  DEFAULT_BYTE_STREAM_CHUNK_SIZE,
  StreamReader,
  _byteChunk,
  readableByteStreamFromReader,
} from "../stream.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

const SUPPORTED_METHODS = [
  "get",
  "head",
  "post",
  "put",
  "delete",
  "connect",
  "options",
  "trace",
  "patch",
];

let REQUEST_CREATE_TOKEN = null;
function token() {
  return (REQUEST_CREATE_TOKEN ??= Symbol("RequestCreateToken"));
}

export class RequestOptions {
  #connectTimeoutNs = undefined;
  #firstByteTimeoutNs = undefined;
  #betweenBytesTimeoutNs = undefined;
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
  getConnectTimeout() {
    return this.#connectTimeoutNs;
  }

  /**
   * Set the timeout for the initial connect to the HTTP Server.
   * WIT:
   * ```
   * set-connect-timeout: func(duration: option<duration>) -> result<_, request-options-error>
   * ```
   *
   * @param {?bigint} duration Duration in nanoseconds, or `null` to clear
   * @throws {HttpError} with payload.tag 'immutable' if this handle is immutable
   */
  setConnectTimeout(duration) {
    this._ensureMutable();
    this.#connectTimeoutNs = duration ?? undefined;
  }

  /**
   * The timeout for receiving the first byte of the Response body.
   * WIT:
   * ```
   * first-byte-timeout: func() -> option<duration>
   * ```
   *
   * @returns {?bigint} Duration in nanoseconds, or `null` if not set
   */
  getFirstByteTimeout() {
    return this.#firstByteTimeoutNs;
  }

  /**
   * Set the timeout for receiving the first byte of the Response body.
   * WIT:
   * ```
   * set-first-byte-timeout: func(duration: option<duration>) -> result<_, request-options-error>
   * ```
   *
   * @param {?bigint} duration Duration in nanoseconds, or `null` to clear
   * @throws {HttpError} with payload.tag 'immutable' if this handle is immutable
   */
  setFirstByteTimeout(duration) {
    this._ensureMutable();
    this.#firstByteTimeoutNs = duration ?? undefined;
  }

  /**
   * The timeout for receiving subsequent chunks of bytes in the Response body.
   * WIT:
   * ```
   * between-bytes-timeout: func() -> option<duration>
   * ```
   *
   * @returns {?bigint} Duration in nanoseconds, or `null` if not set
   */
  getBetweenBytesTimeout() {
    return this.#betweenBytesTimeoutNs;
  }

  /**
   * Set the timeout for receiving subsequent chunks of bytes in the Response body.
   * WIT:
   * ```
   * set-between-bytes-timeout: func(duration: option<duration>) -> result<_, request-options-error>
   * ```
   *
   * @param {?bigint} duration Duration in nanoseconds, or `null` to clear
   * @throws {HttpError} with payload.tag 'immutable' if this handle is immutable
   */
  setBetweenBytesTimeout(duration) {
    this._ensureMutable();
    this.#betweenBytesTimeoutNs = duration ?? undefined;
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
    cloned.#connectTimeoutNs = this.#connectTimeoutNs;
    cloned.#firstByteTimeoutNs = this.#firstByteTimeoutNs;
    cloned.#betweenBytesTimeoutNs = this.#betweenBytesTimeoutNs;
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
      throw new HttpError("immutable", "Cannot modify immutable RequestOptions");
    }
  }
}

export function _optionsLock(fields) {
  return RequestOptions._lock(fields);
}

export class Request {
  #method = { tag: "get" };
  #headers = null;
  #contents = null;
  #options = null;
  #scheme = undefined;
  #authority = undefined;
  #pathWithQuery = undefined;
  #trailersFuture = null;
  #requestFuture = null;
  #contentsDispose = null;
  #bodyOpen = false;
  #bodyEnded = false;

  constructor(t) {
    if (t !== token()) {
      throw new Error("Use Request.new(...) to create a Request");
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
   * @param {?StreamReader|object} contents  optional body stream
   * @param {FutureReader|Promise} trailers  future for trailers
   * @param {?RequestOptions} options  optional RequestOptions
   * @returns {[Request, FutureReader]}
   * @throws {HttpError} with payload.tag 'invalid-argument' for invalid arguments
   *
   */
  static new(headers, contents, trailers, options): [Request, FutureReader] {
    if (options != null && !(options instanceof RequestOptions)) {
      throw new HttpError("invalid-argument", "options must be RequestOptions");
    }

    if (!(headers instanceof Fields)) {
      throw new HttpError("invalid-argument", "headers must be Fields");
    }

    if (!(trailers instanceof FutureReader) && (!trailers || typeof trailers.then !== "function")) {
      throw new HttpError("invalid-argument", "trailers must be FutureReader or Promise");
    }

    let dispose = null;
    if (contents != null && !(contents instanceof StreamReader)) {
      try {
        dispose = contents[symbolDispose]?.bind(contents);
        const inner = readableContentsStream(contents, headers);
        contents = new StreamReader(inner);
      } catch (err) {
        throw new HttpError("invalid-argument", err.message);
      }
    }

    // Generated P3 futures are lazy thenables so we want to observe them now so early error paths don't hang.
    if (!(trailers instanceof FutureReader)) {
      const promise = Promise.resolve(trailers);
      trailers = new FutureReader(promise);
    }

    let request = new Request(token());
    request.#headers = headers;
    request.#contents = contents;
    request.#contentsDispose = dispose;
    request.#options = options;
    request.#trailersFuture = trailers;
    request.#pathWithQuery = undefined;
    request.#scheme = undefined;
    request.#authority = undefined;

    _fieldsLock(request.#headers);
    _optionsLock(request.#options);

    const { tx, rx } = future();
    request.#requestFuture = tx;

    return [request, rx];
  }

  [symbolDispose]() {
    if (this.#contents && !this.#bodyOpen && !this.#bodyEnded) {
      this.#contentsDispose?.();
      this.#contents.close();
    }
    this.#contents = null;
    this.#contentsDispose = null;
    this.#bodyOpen = false;
    this.#bodyEnded = true;
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
  getMethod() {
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
    this.#method = normalizeMethod(method);
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
  getPathWithQuery() {
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
    validateUrlPart(pathWithQuery, UrlPart.PATH_WITH_QUERY);
    this.#pathWithQuery = pathWithQuery === "" ? "/" : (pathWithQuery ?? undefined);
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
  getScheme() {
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
    this.#scheme = normalizeScheme(scheme);
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
  getAuthority() {
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
    validateUrlPart(authority, UrlPart.AUTHORITY);
    this.#authority = authority ?? undefined;
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
  getOptions() {
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
  getHeaders() {
    return this.#headers;
  }

  /**
   * Get body stream and trailers future, consuming the resource.
   *
   * WIT:
   * ```
   * consume-body: static func(this: request, res: future<result<_, error-code>>)
   *   -> tuple<stream<u8>, future<result<option<trailers>, error-code>>>;
   * ```
   *
   * @param {Request} request - The request to consume.
   * @param {FutureReader} res - A future for communicating errors.
   * @returns {[StreamReader, FutureReader]} A tuple of [body stream, trailers future].
   * @throws {HttpError} with payload.tag 'invalid-state' if body already open or consumed.
   */
  static consumeBody(request, res) {
    if (res && typeof res.then === "function") {
      // TODO: Use res to abort/close the body transport on errors.
      void Promise.resolve(res).catch(() => {});
    }

    if (request.#bodyOpen) {
      throw new HttpError("invalid-state", "body already called and not yet closed");
    }

    if (request.#bodyEnded) {
      throw new HttpError("invalid-state", "body has already been consumed");
    }

    if (!request.#contents) {
      request.#bodyEnded = true;
      return [request.#contents, request.#trailersFuture];
    }

    const reader = request.#contents;
    request.#bodyOpen = true;

    const readFn = reader.read.bind(reader);
    reader.read = async (...args) => {
      const chunk = await readFn(...args);
      if (chunk === null) {
        request.#bodyEnded = true;
        request.#bodyOpen = false;
      }

      return chunk;
    };

    const closedFn = reader.close.bind(reader);
    reader.close = () => {
      closedFn();
      request.#bodyEnded = true;
      request.#bodyOpen = false;
    };

    return [request.#contents, request.#trailersFuture];
  }

  // TODO: placeholder
  _resolve(result) {
    if (this.#requestFuture) {
      this.#requestFuture.write(result);
      this.#requestFuture = null;
    }
  }
}

function readableContentsStream(reader, headers) {
  const expectedLength = contentLength(headers.copyAll());
  if (expectedLength === null) {
    return readableByteStreamFromReader(reader, { name: "contents" });
  }

  const source =
    typeof reader?.read === "function"
      ? reader
      : new StreamReader(readableByteStreamFromReader(reader, { name: "contents" }));
  return readableByteStreamFromReader(contentLengthReader(source, expectedLength), {
    name: "contents",
  });
}

function contentLengthReader(reader, expectedLength) {
  let sent = 0n;
  return {
    async read() {
      const result = await reader.read(readOpts(expectedLength - sent));
      if (isIteratorResult(result) && result.rejectedLength !== undefined) {
        throw requestBodySizeError(sent + BigInt(result.rejectedLength));
      }
      if (isIteratorResult(result) && result.done) {
        if (sent < expectedLength) {
          throw requestBodySizeError(sent);
        }
        return result;
      }

      const value = isIteratorResult(result) ? result.value : result;
      const chunk = _byteChunk(value);
      sent += BigInt(chunk.byteLength);
      if (sent > expectedLength) {
        throw requestBodySizeError(sent);
      }
      return { value: chunk, done: false };
    },
    cancel(reason) {
      if (typeof reader.cancel === "function") {
        return reader.cancel(reason);
      }
      if (typeof reader.close === "function") {
        return reader.close();
      }
      return reader[symbolDispose]?.();
    },
  };
}

function readOpts(remaining) {
  if (remaining <= 0n) {
    return { count: 0, rejectLength: 0 };
  }

  const count = Number(
    remaining <= BigInt(DEFAULT_BYTE_STREAM_CHUNK_SIZE)
      ? remaining
      : BigInt(DEFAULT_BYTE_STREAM_CHUNK_SIZE),
  );
  const opts: { count: number; rejectLength?: number } = { count };
  if (remaining <= BigInt(Number.MAX_SAFE_INTEGER)) {
    opts.rejectLength = Number(remaining);
  }
  return opts;
}

function requestBodySizeError(bytes) {
  return { tag: "HTTP-request-body-size", val: bytes };
}

function isIteratorResult(value) {
  return value != null && typeof value === "object" && typeof value.done === "boolean";
}

const decoder = new TextDecoder();

const contentLength = (entries) => {
  const entry = entries.findLast(([name]) => name.toLowerCase() === "content-length");
  if (!entry) {
    return null;
  }

  const value = decoder.decode(entry[1]);
  return /^\d+$/.test(value) ? BigInt(value) : null;
};

const UrlPart = {
  PATH_WITH_QUERY: "pathWithQuery",
  SCHEME: "scheme",
  AUTHORITY: "authority",
};

function normalizeMethod(method) {
  const VALUE_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

  if (typeof method === "string") {
    if (!VALUE_TOKEN_RE.test(method)) {
      throw new HttpError("invalid-syntax");
    }

    const lowercase = method.toLowerCase();
    return SUPPORTED_METHODS.includes(lowercase)
      ? { tag: lowercase }
      : { tag: "other", val: lowercase };
  }

  if (!method || typeof method !== "object" || typeof method.tag !== "string") {
    throw new HttpError("invalid-syntax");
  }

  if (SUPPORTED_METHODS.includes(method.tag)) {
    return { tag: method.tag };
  }

  if (method.tag === "other" && typeof method.val === "string" && VALUE_TOKEN_RE.test(method.val)) {
    const standard = method.val.toLowerCase();
    return SUPPORTED_METHODS.includes(standard) && method.val === method.val.toUpperCase()
      ? { tag: standard }
      : { tag: "other", val: method.val };
  }

  throw new HttpError("invalid-syntax");
}

function normalizeScheme(scheme) {
  if (scheme == null) {
    return undefined;
  }

  if (typeof scheme === "string") {
    validateUrlPart(scheme, UrlPart.SCHEME);
    const uppercase = scheme.toUpperCase();
    if (uppercase === "HTTP" || uppercase === "HTTPS") {
      return { tag: uppercase };
    }
    return { tag: "other", val: scheme };
  }

  if (typeof scheme !== "object" || typeof scheme.tag !== "string") {
    throw new HttpError("invalid-syntax");
  }

  if (scheme.tag === "HTTP" || scheme.tag === "HTTPS") {
    return { tag: scheme.tag };
  }

  if (scheme.tag === "other" && typeof scheme.val === "string") {
    validateUrlPart(scheme.val, UrlPart.SCHEME);
    const uppercase = scheme.val.toUpperCase();
    if (uppercase === "HTTP" || uppercase === "HTTPS") {
      return { tag: uppercase };
    }
    return { tag: "other", val: scheme.val };
  }

  throw new HttpError("invalid-syntax");
}

export function _schemeToString(scheme) {
  if (scheme === undefined) {
    return undefined;
  }

  switch (scheme.tag) {
    case "HTTP":
      return "http";
    case "HTTPS":
      return "https";
    case "other":
      return scheme.val;
    default:
      throw new HttpError("invalid-syntax", `Invalid scheme: ${scheme.tag}`);
  }
}

function validateUrlPart(value, part) {
  if (value == null) {
    return;
  }

  // URL parsing may normalize some raw control characters but wasi treats them as invalid syntax.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new HttpError("invalid-syntax", `Invalid ${part}: ${value}`);
  }

  if (part === UrlPart.PATH_WITH_QUERY && /[ <>`]/.test(value)) {
    throw new HttpError("invalid-syntax", `Invalid ${part}: ${value}`);
  }

  try {
    switch (part) {
      case UrlPart.PATH_WITH_QUERY:
        new URL(value, "http://example");
        break;
      case UrlPart.SCHEME:
        new URL(`${value}://example`);
        break;
      case UrlPart.AUTHORITY:
        new URL(`http://${value}`);
        break;
      default:
        throw new Error(`Unknown URL part: ${part}`);
    }
  } catch {
    throw new HttpError("invalid-syntax", `Invalid ${part}: ${value}`);
  }
}

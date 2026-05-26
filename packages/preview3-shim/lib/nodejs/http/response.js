import { FutureReader, future } from "../future.js";
import { StreamReader, readableByteStreamFromReader } from "../stream.js";
import { HttpError } from "./error.js";
import { Fields, _fieldsLock } from "./fields.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

let RESPONSE_CREATE_TOKEN = null;
function token() {
  return (RESPONSE_CREATE_TOKEN ??= Symbol("ResponseCreateToken"));
}

export class Response {
  #statusCode = 200;
  #headers = null;
  #contents = null;
  #trailersFuture = null;
  #responseFuture = null;
  #contentsDispose = null;
  #bodyOpen = false;
  #bodyEnded = false;

  /**
   * @private
   * Use Response.new(...) to create an instance
   */
  constructor(t) {
    if (t !== token()) {
      throw new Error("Use Response.new(...) to create a Response");
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
   * @param {?StreamReader|object} contents  optional body stream
   * @param {FutureReader|Promise} trailers  future for trailers
   * @returns {{ res: Response, future: FutureReader }}
   * @throws {HttpError} with payload.tag 'invalid-argument' for invalid arguments
   */
  static new(headers, contents, trailers) {
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
        const inner = readableByteStreamFromReader(contents, { name: "contents" });
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

    const response = new Response(token());
    response.#headers = _fieldsLock(headers);
    response.#contents = contents;
    response.#contentsDispose = dispose;
    response.#trailersFuture = trailers;

    const { tx, rx } = future();
    response.#responseFuture = tx;

    return [response, rx];
  }

  [symbolDispose]() {
    if (this.#contents && !this.#bodyOpen && !this.#bodyEnded) {
      this.#contentsDispose?.();
      this.#closeBody();
    }
    this.#contents = null;
    this.#contentsDispose = null;
    this.#bodyOpen = false;
    this.#bodyEnded = true;
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
  getStatusCode() {
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
    if (typeof code !== "number" || !Number.isInteger(code) || code < 100 || code > 599) {
      throw new HttpError("invalid-argument", `Invalid status code: ${code}`);
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
  getHeaders() {
    return this.#headers;
  }

  /**
   * Get body stream and trailers future, consuming the resource.
   *
   * WIT:
   * ```
   * consume-body: static func(this: response, res: future<result<_, error-code>>)
   *   -> tuple<stream<u8>, future<result<option<trailers>, error-code>>>;
   * ```
   *
   * @param {Response} response - The response to consume.
   * @param {FutureReader} res - A future for communicating errors.
   * @returns {[StreamReader, FutureReader]} A tuple of [body stream, trailers future].
   * @throws {HttpError} with payload.tag 'invalid-state' if body has already been opened or consumed.
   */
  static consumeBody(response, res) {
    if (res && typeof res.then === "function") {
      // TODO: Use res to abort/close the body transport on errors.
      void Promise.resolve(res).catch(() => {});
    }

    if (response.#bodyOpen) {
      throw new HttpError("invalid-state", "body already opened and not yet closed");
    }

    if (response.#bodyEnded) {
      throw new HttpError("invalid-state", "body has already been consumed");
    }

    if (!response.#contents) {
      response.#bodyEnded = true;
      return [response.#contents, response.#trailersFuture];
    }

    const reader = response.#contents;
    response.#bodyOpen = true;

    const readFn = reader.read.bind(reader);
    reader.read = async (...args) => {
      const chunk = await readFn(...args);
      if (chunk === null) {
        response.#bodyEnded = true;
        response.#bodyOpen = false;
      }

      return chunk;
    };

    const closedFn = reader.close.bind(reader);
    reader.close = () => {
      response.#closeBody(closedFn);
    };

    const cancelFn = reader.cancel.bind(reader);
    reader.cancel = async (...args) => {
      await response.#closeBody(() => cancelFn(...args));
    };

    return [response.#contents, response.#trailersFuture];
  }

  // Internal: call to complete the response transmission
  _resolve(result) {
    if (this.#responseFuture) {
      this.#responseFuture.write(result);
      this.#responseFuture = null;
    }
  }

  #closeBody(close = this.#contents?.close.bind(this.#contents)) {
    const closeTrailers = !this.#bodyEnded;
    try {
      return close?.();
    } finally {
      if (closeTrailers) {
        this.#trailersFuture.close();
      }
      this.#bodyEnded = true;
      this.#bodyOpen = false;
    }
  }
}

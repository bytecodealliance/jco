// wasi:http/types@0.2.0 interface

//import { Duration } from "../clocks/monotonic-clock.js";
import { InputStream, OutputStream } from "../io/streams.js";
import { Pollable } from "../io/poll.js";

//export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
const symbolDispose = Symbol.dispose || Symbol.for("dispose");

//export type Method = MethodGet | MethodHead | MethodPost | MethodPut | MethodDelete | MethodConnect | MethodOptions | MethodTrace | MethodPatch | MethodOther;
//export interface MethodGet {
//  tag: 'get',
//}
//export interface MethodHead {
//  tag: 'head',
//}
//export interface MethodPost {
//  tag: 'post',
//}
//export interface MethodPut {
//  tag: 'put',
//}
//export interface MethodDelete {
//  tag: 'delete',
//}
//export interface MethodConnect {
//  tag: 'connect',
//}
//export interface MethodOptions {
//  tag: 'options',
//}
//export interface MethodTrace {
//  tag: 'trace',
//}
//export interface MethodPatch {
//  tag: 'patch',
//}
//export interface MethodOther {
//  tag: 'other',
//  val: string,
//}
//
//
//export type Scheme = SchemeHttp | SchemeHttps | SchemeOther;
//export interface SchemeHttp {
//  tag: 'HTTP',
//}
//export interface SchemeHttps {
//  tag: 'HTTPS',
//}
//export interface SchemeOther {
//  tag: 'other',
//  val: string,
//}
//
//
//export interface DnsErrorPayload {
//  rcode?: string,
//  infoCode?: number,
//}
//
//
//export interface TlsAlertReceivedPayload {
//  alertId?: number,
//  alertMessage?: string,
//}
//
//
//export interface FieldSizePayload {
//  fieldName?: string,
//  fieldSize?: number,
//}
//
//
//export type ErrorCode = ErrorCodeDnsTimeout | ErrorCodeDnsError | ErrorCodeDestinationNotFound | ErrorCodeDestinationUnavailable | ErrorCodeDestinationIpProhibited | ErrorCodeDestinationIpUnroutable | ErrorCodeConnectionRefused | ErrorCodeConnectionTerminated | ErrorCodeConnectionTimeout | ErrorCodeConnectionReadTimeout | ErrorCodeConnectionWriteTimeout | ErrorCodeConnectionLimitReached | ErrorCodeTlsProtocolError | ErrorCodeTlsCertificateError | ErrorCodeTlsAlertReceived | ErrorCodeHttpRequestDenied | ErrorCodeHttpRequestLengthRequired | ErrorCodeHttpRequestBodySize | ErrorCodeHttpRequestMethodInvalid | ErrorCodeHttpRequestUriInvalid | ErrorCodeHttpRequestUriTooLong | ErrorCodeHttpRequestHeaderSectionSize | ErrorCodeHttpRequestHeaderSize | ErrorCodeHttpRequestTrailerSectionSize | ErrorCodeHttpRequestTrailerSize | ErrorCodeHttpResponseIncomplete | ErrorCodeHttpResponseHeaderSectionSize | ErrorCodeHttpResponseHeaderSize | ErrorCodeHttpResponseBodySize | ErrorCodeHttpResponseTrailerSectionSize | ErrorCodeHttpResponseTrailerSize | ErrorCodeHttpResponseTransferCoding | ErrorCodeHttpResponseContentCoding | ErrorCodeHttpResponseTimeout | ErrorCodeHttpUpgradeFailed | ErrorCodeHttpProtocolError | ErrorCodeLoopDetected | ErrorCodeConfigurationError | ErrorCodeInternalError;
//export interface ErrorCodeDnsTimeout {
//  tag: 'DNS-timeout',
//}
//export interface ErrorCodeDnsError {
//  tag: 'DNS-error',
//  val: DnsErrorPayload,
//}
//export interface ErrorCodeDestinationNotFound {
//  tag: 'destination-not-found',
//}
//export interface ErrorCodeDestinationUnavailable {
//  tag: 'destination-unavailable',
//}
//export interface ErrorCodeDestinationIpProhibited {
//  tag: 'destination-IP-prohibited',
//}
//export interface ErrorCodeDestinationIpUnroutable {
//  tag: 'destination-IP-unroutable',
//}
//export interface ErrorCodeConnectionRefused {
//  tag: 'connection-refused',
//}
//export interface ErrorCodeConnectionTerminated {
//  tag: 'connection-terminated',
//}
//export interface ErrorCodeConnectionTimeout {
//  tag: 'connection-timeout',
//}
//export interface ErrorCodeConnectionReadTimeout {
//  tag: 'connection-read-timeout',
//}
//export interface ErrorCodeConnectionWriteTimeout {
//  tag: 'connection-write-timeout',
//}
//export interface ErrorCodeConnectionLimitReached {
//  tag: 'connection-limit-reached',
//}
//export interface ErrorCodeTlsProtocolError {
//  tag: 'TLS-protocol-error',
//}
//export interface ErrorCodeTlsCertificateError {
//  tag: 'TLS-certificate-error',
//}
//export interface ErrorCodeTlsAlertReceived {
//  tag: 'TLS-alert-received',
//  val: TlsAlertReceivedPayload,
//}
//export interface ErrorCodeHttpRequestDenied {
//  tag: 'HTTP-request-denied',
//}
//export interface ErrorCodeHttpRequestLengthRequired {
//  tag: 'HTTP-request-length-required',
//}
//export interface ErrorCodeHttpRequestBodySize {
//  tag: 'HTTP-request-body-size',
//  val: bigint | undefined,
//}
//export interface ErrorCodeHttpRequestMethodInvalid {
//  tag: 'HTTP-request-method-invalid',
//}
//export interface ErrorCodeHttpRequestUriInvalid {
//  tag: 'HTTP-request-URI-invalid',
//}
//export interface ErrorCodeHttpRequestUriTooLong {
//  tag: 'HTTP-request-URI-too-long',
//}
//export interface ErrorCodeHttpRequestHeaderSectionSize {
//  tag: 'HTTP-request-header-section-size',
//  val: number | undefined,
//}
//export interface ErrorCodeHttpRequestHeaderSize {
//  tag: 'HTTP-request-header-size',
//  val: FieldSizePayload | undefined,
//}
//export interface ErrorCodeHttpRequestTrailerSectionSize {
//  tag: 'HTTP-request-trailer-section-size',
//  val: number | undefined,
//}
//export interface ErrorCodeHttpRequestTrailerSize {
//  tag: 'HTTP-request-trailer-size',
//  val: FieldSizePayload,
//}
//export interface ErrorCodeHttpResponseIncomplete {
//  tag: 'HTTP-response-incomplete',
//}
//export interface ErrorCodeHttpResponseHeaderSectionSize {
//  tag: 'HTTP-response-header-section-size',
//  val: number | undefined,
//}
//export interface ErrorCodeHttpResponseHeaderSize {
//  tag: 'HTTP-response-header-size',
//  val: FieldSizePayload,
//}
//export interface ErrorCodeHttpResponseBodySize {
//  tag: 'HTTP-response-body-size',
//  val: bigint | undefined,
//}
//export interface ErrorCodeHttpResponseTrailerSectionSize {
//  tag: 'HTTP-response-trailer-section-size',
//  val: number | undefined,
//}
//export interface ErrorCodeHttpResponseTrailerSize {
//  tag: 'HTTP-response-trailer-size',
//  val: FieldSizePayload,
//}
//export interface ErrorCodeHttpResponseTransferCoding {
//  tag: 'HTTP-response-transfer-coding',
//  val: string | undefined,
//}
//export interface ErrorCodeHttpResponseContentCoding {
//  tag: 'HTTP-response-content-coding',
//  val: string | undefined,
//}
//export interface ErrorCodeHttpResponseTimeout {
//  tag: 'HTTP-response-timeout',
//}
//export interface ErrorCodeHttpUpgradeFailed {
//  tag: 'HTTP-upgrade-failed',
//}
//export interface ErrorCodeHttpProtocolError {
//  tag: 'HTTP-protocol-error',
//}
//export interface ErrorCodeLoopDetected {
//  tag: 'loop-detected',
//}
//export interface ErrorCodeConfigurationError {
//  tag: 'configuration-error',
//}
//// This is a catch-all error for anything that doesn't fit cleanly into a
//// more specific case. It also includes an optional string for an
//// unstructured description of the error. Users should not depend on the
//// string for diagnosing errors, as it's not required to be consistent
//// between implementations.
//export interface ErrorCodeInternalError {
//  tag: 'internal-error',
//  val: string | undefined,
//}
//
//
//export type HeaderError = HeaderErrorInvalidSyntax | HeaderErrorForbidden | HeaderErrorImmutable;
//export interface HeaderErrorInvalidSyntax {
//  tag: 'invalid-syntax',
//}
//export interface HeaderErrorForbidden {
//  tag: 'forbidden',
//}
//export interface HeaderErrorImmutable {
//  tag: 'immutable',
//}
//
//
//export type FieldKey = string;
//export type FieldValue = Uint8Array;

/**
 * @typedef {string} FieldKey
 */

/**
 * @typedef {Uint8Array} FieldValue
 */

export class Fields {
  headers;
  immutable;

  /**
   * @param {Headers|undefined} headers
   * @param {boolean|undefined} immutable
   */
  constructor(headers = new Headers(), immutable = false) {
    this.headers = headers;
    this.immutable = immutable;
  }

  /**
   * @param {Array<[FieldKey, FieldValue]>} entries
   * @returns {Fields}
   */
  static fromList(entries) {
    const fields = new Fields();
    const dec = new TextDecoder();
    for (const [key, val] of entries) {
      fields.headers.append(key, dec.decode(val));
    }
    return fields;
  }

  /**
   * @param {FieldKey} name
   * @returns {Array<FieldValue>}
   */
  get(name) {
    const enc = new TextEncoder();
    return (
      this.headers
        .get(name)
        ?.split(", ")
        .map((val) => enc.encode(val)) || []
    );
  }
  /**
   * @param {FieldKey} name
   * @returns {boolean}
   */
  has(name) {
    return this.headers.has(name);
  }
  /**
   * @param {FieldKey} name
   * @param {Array<FieldValue>} value
   */
  set(name, value) {
    if (this.immutable) {
      throw { tag: "immutable" };
    }
    const dec = new TextDecoder();
    this.headers.set(name, value.map((val) => dec.decode(val)).join(", "));
  }
  /**
   * @param {FieldKey} name
   */
  delete(name) {
    if (this.immutable) {
      throw { tag: "immutable" };
    }
    this.headers.delete(name);
  }
  /**
   * @param {FieldKey} name
   * @param {FieldValue} value
   */
  append(name, value) {
    if (this.immutable) {
      throw { tag: "immutable" };
    }
    const dec = new TextDecoder();
    this.headers.append(name, dec.decode(value));
  }
  /**
   * @returns {Array<[FieldKey, FieldValue]>}
   */
  entries() {
    const entries = [];
    const enc = new TextEncoder();
    this.headers.forEach((val, key) => {
      entries.push([key, enc.encode(val)]);
    });
    return entries;
  }
  /**
   * @returns {Fields}
   */
  clone() {
    const fields = new Fields();
    this.headers.forEach((val, key) => {
      fields.headers.set(key, val);
    });
    return fields;
  }
}

//export type Headers = Fields;
//export type Trailers = Fields;

export class IncomingRequest {
  #method;
  #pathWithQuery;
  #scheme;
  #authority;
  #headers;
  #body;

  /**
   * @param {Method} method
   * @param {string|undefined} pathWithQuery
   * @param {Scheme|undefined} scheme
   * @param {string|undefined} authority
   * @param {Fields|undefined} headers
   * @param {IncomingBody|undefined} body
   */
  constructor(method, pathWithQuery, scheme, authority, headers, body) {
    this.#method = method;
    this.#pathWithQuery = pathWithQuery;
    this.#scheme = scheme;
    this.#authority = authority;
    this.#headers = headers || new Fields();
    this.#body = body;
  }

  /**
   * @returns {Method}
   */
  method() {
    return this.#method;
  }
  /**
   * @returns {string|undefined}
   */
  pathWithQuery() {
    return this.#pathWithQuery;
  }
  /**
   * @returns {Scheme|undefined}
   */
  scheme() {
    return this.#scheme;
  }
  /**
   * @returns {string|undefined}
   */
  authority() {
    return this.#authority;
  }
  /**
   * @returns {Fields}
   */
  headers() {
    return this.#headers;
  }
  /**
   * @returns {IncomingBody}
   */
  consume() {
    if (this.#body) {
      return this.#body;
    }
    throw undefined;
  }
  [symbolDispose]() {}

  /**
   * @param {Request} req
   * @returns {IncomingRequest}
   */
  static fromRequest(req) {
    const method = { tag: req.method.toLowerCase() };
    const url = new URL(req.url);
    const scheme = { tag: url.protocol.slice(0, -1).toUpperCase() };
    const authority = url.host;
    const pathWithQuery = `${url.pathname}${url.search}${url.hash}`;
    const headers = new Fields(req.headers, true);
    const body = new IncomingBody(new InputStream(req.body));

    return new IncomingRequest(
      method,
      pathWithQuery,
      scheme,
      authority,
      headers,
      body,
    );
  }
}

export class OutgoingRequest {
  #headers;
  #method;
  #pathWithQuery;
  #scheme;
  #authority;
  #body;

  /**
   * @param {Fields} headers
   */
  constructor(headers) {
    headers.immutable = true;
    this.#headers = headers;
    this.#body = new OutgoingBody();
  }
  /**
   * @returns {OutgoingBody}
   */
  body() {
    return this.#body;
  }
  /**
   * @returns {Method}
   */
  method() {
    return this.#method || { tag: "get" };
  }
  /**
   * @param {Method} method
   */
  setMethod(method) {
    this.#method = method;
  }
  /**
   * @returns {string|undefined}
   */
  pathWithQuery() {
    return this.#pathWithQuery;
  }
  /**
   * @param {string|undefined} pathWithQuery
   */
  setPathWithQuery(pathWithQuery) {
    this.#pathWithQuery = pathWithQuery;
  }
  scheme() {
    return this.#scheme;
  }
  setScheme(scheme) {
    this.#scheme = scheme;
  }
  authority() {
    return this.#authority;
  }
  setAuthority(authority) {
    this.#authority = authority;
  }
  headers() {
    return this.#headers;
  }

  toRequest() {
    if ((this.#scheme && this.#scheme.tag === "other") || !this.#authority) {
      throw { tag: "destination-not-found" };
    }
    const path = this.#pathWithQuery
      ? this.#pathWithQuery.startsWith("/")
        ? this.#pathWithQuery
        : `/${this.#pathWithQuery}`
      : "";

    const method = this.#method ? this.#method.tag : "get";
    const body =
      method === "get" || method === "head"
        ? undefined
        : this.#body.stream.readable;
    // see: https://fetch.spec.whatwg.org/#ref-for-dom-requestinit-duplex
    // see: https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests#half_duplex
    const duplex = body ? "half" : undefined;
    return new Request(
      `${this.#scheme ? this.#scheme.tag : "HTTPS"}://${this.#authority}${path}`,
      {
        method,
        headers: this.#headers.headers,
        body,
        duplex,
      },
    );
  }
}

// TODO
export class RequestOptions {
  constructor() {}
  connectTimeout() {
    return;
  }
  setConnectTimeout(_duration) {
    return;
  }
  firstByteTimeout() {
    return;
  }
  setFirstByteTimeout(_duration) {
    return;
  }
  betweenBytesTimeout() {
    return;
  }
  setBetweenBytesTimeout(_duration) {
    return;
  }
}

export class ResponseOutparam {
  promise; /** Promise<Result<OutgoingResponse, ErrorCode>> */
  resolve; /** (result: Result<OutgoingResponse, ErrorCode>) => void */

  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  static set(param, response) {
    param.resolve(response);
  }
}

//export type StatusCode = number;

export class IncomingResponse {
  #statusCode;
  #headers;
  #body;

  constructor(statusCode, headers, body) {
    this.#statusCode = statusCode;
    this.#headers = headers;
    this.#body = body;
  }

  status() {
    return this.#statusCode;
  }
  headers() {
    return this.#headers;
  }
  consume() {
    return this.#body;
  }
}

export class IncomingBody {
  #stream;

  constructor(stream) {
    this.#stream = stream;
  }
  stream() {
    return this.#stream;
  }
  static finish(_body) {
    return new FutureTrailers();
  }
  [symbolDispose]() {}
}

export class FutureTrailers {
  #trailers;
  #errCode;

  constructor(trailers, errCode) {
    this.#trailers = trailers;
    this.#errCode = errCode;
  }
  subscribe() {
    return new Pollable();
  }
  get() {
    if (this.#errCode) {
      return { tag: "ok", val: { tag: "err", val: this.#errCode } };
    }
    return { tag: "ok", val: { tag: "ok", val: this.#trailers } };
  }
}

export class OutgoingResponse {
  #headers;
  #statusCode;
  #body;

  constructor(headers) {
    this.#headers = headers;
    this.#statusCode = 200;
    this.#body = new OutgoingBody();
  }
  statusCode() {
    return this.#statusCode;
  }
  setStatusCode(statusCode) {
    this.#statusCode = statusCode;
  }
  headers() {
    return this.#headers;
  }
  body() {
    return this.#body;
  }
  [symbolDispose]() {}

  toResponse() {
    return new Response(this.#body.stream.readable, {
      status: this.#statusCode,
      headers: this.#headers.headers,
    });
  }
}

export class OutgoingBody {
  finished;
  stream;

  constructor() {
    this.finished = false;
    this.stream = new OutputStream();
  }
  write() {
    return this.stream;
  }
  static finish(body, trailers) {
    // trailers not supported
    if (trailers) {
      throw { tag: "HTTP-request-trailer-section-size" };
    }
    body.stream.close();
    body.finished = true;
  }
  [symbolDispose]() {
    OutgoingBody.finish(this);
  }
}

export class FutureIncomingResponse {
  #promise;
  #resolvedResponse;
  #ready = false;
  #error;

  constructor(request) {
    try {
      this.#promise = fetch(request.toRequest()).then((response) => {
        this.#ready = true;
        this.#resolvedResponse = response;
      });
    } catch (err) {
      console.error(err);
      this.#promise = Promise.resolve();
      this.#ready = true;
      // TODO better error handling
      this.#error = { tag: "internal-error", val: err.toString() };
    }
  }

  subscribe() {
    return new Pollable(this.#promise);
  }
  get() {
    if (!this.#ready) return;
    if (this.#error) return { tag: "err", val: this.#error };

    const res = this.#resolvedResponse;

    return {
      tag: "ok",
      val: {
        tag: "ok",
        val: new IncomingResponse(
          res.status,
          new Fields(res.headers, true),
          new IncomingBody(new InputStream(res.body)),
        ),
      },
    };
  }
}

export const httpErrorCode = (_err) => {
  return;
};

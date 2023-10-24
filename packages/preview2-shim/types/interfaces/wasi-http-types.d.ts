export namespace WasiHttpTypes {
  /**
   * Construct an HTTP Fields.
   * 
   * The list represents each key-value pair in the Fields. Keys
   * which have multiple values are represented by multiple entries in this
   * list with the same key.
   * 
   * The tuple is a pair of the field key, represented as a string, and
   * Value, represented as a list of bytes. In a valid Fields, all keys
   * and values are valid UTF-8 strings. However, values are not always
   * well-formed, so they are represented as a raw list of bytes.
   */
  export { Fields };
  /**
   * Get all of the values corresponding to a key.
   */
  /**
   * Set all of the values for a key. Clears any existing values for that
   * key, if they have been set.
   */
  /**
   * Delete all values for a key. Does nothing if no values for the key
   * exist.
   */
  /**
   * Append a value for a key. Does not change or delete any existing
   * values for that key.
   */
  /**
   * Retrieve the full set of keys and values in the Fields. Like the
   * constructor, the list represents each key-value pair.
   * 
   * The outer list represents each key-value pair in the Fields. Keys
   * which have multiple values are represented by multiple entries in this
   * list with the same key.
   */
  /**
   * Make a deep copy of the Fields. Equivelant in behavior to calling the
   * `fields` constructor on the return value of `entries`
   */
  /**
   * Returns the method of the incoming request.
   */
  export { IncomingRequest };
  /**
   * Returns the path with query parameters from the request, as a string.
   */
  /**
   * Returns the protocol scheme from the request.
   */
  /**
   * Returns the authority from the request, if it was present.
   */
  /**
   * Returns the `headers` from the request.
   * 
   * The `headers` returned are a child resource: it must be dropped before
   * the parent `incoming-request` is dropped. Dropping this
   * `incoming-request` before all children are dropped will trap.
   */
  /**
   * Gives the `incoming-body` associated with this request. Will only
   * return success at most once, and subsequent calls will return error.
   */
  /**
   * Construct a new `outgoing-request`.
   */
  export { OutgoingRequest };
  /**
   * Will return the outgoing-body child at most once. If called more than
   * once, subsequent calls will return error.
   */
  /**
   * Set the value of the `response-outparam` to either send a response,
   * or indicate an error.
   * 
   * This method consumes the `response-outparam` to ensure that it is
   * called at most once. If it is never called, the implementation
   * will respond with an error.
   */
  export { ResponseOutparam };
  /**
   * Returns the status code from the incoming response.
   */
  export { IncomingResponse };
  /**
   * Returns the headers from the incoming response.
   */
  /**
   * Returns the incoming body. May be called at most once. Returns error
   * if called additional times.
   */
  /**
   * Returns the contents of the body, as a stream of bytes.
   * 
   * Returns success on first call: the stream representing the contents
   * can be retrieved at most once. Subsequent calls will return error.
   * 
   * The returned `input-stream` resource is a child: it must be dropped
   * before the parent `incoming-body` is dropped, or consumed by
   * `incoming-body.finish`.
   * 
   * This invariant ensures that the implementation can determine whether
   * the user is consuming the contents of the body, waiting on the
   * `future-trailers` to be ready, or neither. This allows for network
   * backpressure is to be applied when the user is consuming the body,
   * and for that backpressure to not inhibit delivery of the trailers if
   * the user does not read the entire body.
   */
  export { IncomingBody };
  /**
   * Takes ownership of `incoming-body`, and returns a `future-trailers`.
   * This function will trap if the `input-stream` child is still alive.
   */
  /**
   * Returns a pollable which becomes ready when either the trailers have
   * been received, or an error has occured. When this pollable is ready,
   * the `get` method will return `some`.
   */
  export { FutureTrailers };
  /**
   * Returns the contents of the trailers, or an error which occured,
   * once the future is ready.
   * 
   * The outer `option` represents future readiness. Users can wait on this
   * `option` to become `some` using the `subscribe` method.
   * 
   * The `result` represents that either the HTTP Request or Response body,
   * as well as any trailers, were received successfully, or that an error
   * occured receiving them.
   */
  /**
   * Construct an `outgoing-response`.
   */
  export { OutgoingResponse };
  /**
   * Returns the resource corresponding to the outgoing Body for this Response.
   * 
   * Returns success on the first call: the `outgoing-body` resource for
   * this `outgoing-response` can be retrieved at most once. Sunsequent
   * calls will return error.
   * 
   * FIXME: rename this method to `body`.
   */
  /**
   * Returns a stream for writing the body contents.
   * 
   * The returned `output-stream` is a child resource: it must be dropped
   * before the parent `outgoing-body` resource is dropped (or finished),
   * otherwise the `outgoing-body` drop or `finish` will trap.
   * 
   * Returns success on the first call: the `output-stream` resource for
   * this `outgoing-body` may be retrieved at most once. Subsequent calls
   * will return error.
   */
  export { OutgoingBody };
  /**
   * Finalize an outgoing body, optionally providing trailers. This must be
   * called to signal that the response is complete. If the `outgoing-body`
   * is dropped without calling `outgoing-body.finalize`, the implementation
   * should treat the body as corrupted.
   */
  /**
   * Returns a pollable which becomes ready when either the Response has
   * been received, or an error has occured. When this pollable is ready,
   * the `get` method will return `some`.
   */
  export { FutureIncomingResponse };
  /**
   * Returns the incoming HTTP Response, or an error, once one is ready.
   * 
   * The outer `option` represents future readiness. Users can wait on this
   * `option` to become `some` using the `subscribe` method.
   * 
   * The outer `result` is used to retrieve the response or error at most
   * once. It will be success on the first call in which the outer option
   * is `some`, and error on subsequent calls.
   * 
   * The inner `result` represents that either the incoming HTTP Response
   * status and headers have recieved successfully, or that an error
   * occured. Errors may also occur while consuming the response body,
   * but those will be reported by the `incoming-body` and its
   * `output-stream` child.
   */
}
import type { InputStream } from '../interfaces/wasi-io-streams.js';
export { InputStream };
import type { OutputStream } from '../interfaces/wasi-io-streams.js';
export { OutputStream };
import type { Pollable } from '../interfaces/wasi-io-poll.js';
export { Pollable };
/**
 * This type corresponds to HTTP standard Methods.
 */
export type Method = MethodGet | MethodHead | MethodPost | MethodPut | MethodDelete | MethodConnect | MethodOptions | MethodTrace | MethodPatch | MethodOther;
export interface MethodGet {
  tag: 'get',
}
export interface MethodHead {
  tag: 'head',
}
export interface MethodPost {
  tag: 'post',
}
export interface MethodPut {
  tag: 'put',
}
export interface MethodDelete {
  tag: 'delete',
}
export interface MethodConnect {
  tag: 'connect',
}
export interface MethodOptions {
  tag: 'options',
}
export interface MethodTrace {
  tag: 'trace',
}
export interface MethodPatch {
  tag: 'patch',
}
export interface MethodOther {
  tag: 'other',
  val: string,
}
/**
 * This type corresponds to HTTP standard Related Schemes.
 */
export type Scheme = SchemeHttp | SchemeHttps | SchemeOther;
export interface SchemeHttp {
  tag: 'HTTP',
}
export interface SchemeHttps {
  tag: 'HTTPS',
}
export interface SchemeOther {
  tag: 'other',
  val: string,
}
/**
 * TODO: perhaps better align with HTTP semantics?
 * This type enumerates the different kinds of errors that may occur when
 * initially returning a response.
 */
export type Error = ErrorInvalidUrl | ErrorTimeoutError | ErrorProtocolError | ErrorUnexpectedError;
export interface ErrorInvalidUrl {
  tag: 'invalid-url',
  val: string,
}
export interface ErrorTimeoutError {
  tag: 'timeout-error',
  val: string,
}
export interface ErrorProtocolError {
  tag: 'protocol-error',
  val: string,
}
export interface ErrorUnexpectedError {
  tag: 'unexpected-error',
  val: string,
}
/**
 * Field keys are always strings.
 */
export type FieldKey = string;
/**
 * Field values should always be ASCII strings. However, in
 * reality, HTTP implementations often have to interpret malformed values,
 * so they are provided as a list of bytes.
 */
export type FieldValue = Uint8Array;
/**
 * Headers is an alias for Fields.
 */
export type Headers = Fields;
/**
 * Trailers is an alias for Fields.
 */
export type Trailers = Fields;
/**
 * Parameters for making an HTTP Request. Each of these parameters is an
 * optional timeout, with the unit in milliseconds, applicable to the
 * transport layer of the HTTP protocol.
 * 
 * These timeouts are separate from any the user may use to bound a
 * blocking call to `wasi:io/poll.poll-list`.
 * 
 * FIXME: Make this a resource to allow it to be optionally extended by
 * future evolution of the standard and/or other interfaces at some later
 * date?
 */
export interface RequestOptions {
  /**
   * The timeout for the initial connect to the HTTP Server.
   */
  connectTimeoutMs?: number,
  /**
   * The timeout for receiving the first byte of the Response body.
   */
  firstByteTimeoutMs?: number,
  /**
   * The timeout for receiving subsequent chunks of bytes in the Response
   * body stream.
   */
  betweenBytesTimeoutMs?: number,
}
/**
 * This type corresponds to the HTTP standard Status Code.
 */
export type StatusCode = number;

export class OutgoingRequest {
  constructor(method: Method, pathWithQuery: string | undefined, scheme: Scheme | undefined, authority: string | undefined, headers: Headers)
  write(): OutgoingBody;
}

export class IncomingBody {
  stream(): InputStream;
  static finish(this_: IncomingBody): FutureTrailers;
}

export class ResponseOutparam {
  static set(param: ResponseOutparam, response: Result<OutgoingResponse, Error>): void;
}

export class OutgoingResponse {
  constructor(statusCode: StatusCode, headers: Headers)
  write(): OutgoingBody;
}

export class Fields {
  constructor(entries: [FieldKey, FieldValue][])
  get(name: FieldKey): FieldValue[];
  set(name: FieldKey, value: FieldValue[]): void;
  delete(name: FieldKey): void;
  append(name: FieldKey, value: FieldValue): void;
  entries(): [FieldKey, FieldValue][];
  clone(): Fields;
}

export class FutureTrailers {
  subscribe(): Pollable;
  get(): Result<Trailers, Error> | undefined;
}

export class IncomingResponse {
  status(): StatusCode;
  headers(): Headers;
  consume(): IncomingBody;
}

export class OutgoingBody {
  write(): OutputStream;
  static finish(this_: OutgoingBody, trailers: Trailers | undefined): void;
}

export class IncomingRequest {
  method(): Method;
  pathWithQuery(): string | undefined;
  scheme(): Scheme | undefined;
  authority(): string | undefined;
  headers(): Headers;
  consume(): IncomingBody;
}

export class FutureIncomingResponse {
  subscribe(): Pollable;
  get(): Result<Result<IncomingResponse, Error>, void> | undefined;
}

export namespace Types {
  export function dropFields(fields: Fields): void;
  export function newFields(entries: [string, string][]): Fields;
  export function fieldsGet(fields: Fields, name: string): string[];
  export function fieldsSet(fields: Fields, name: string, value: string[]): void;
  export function fieldsDelete(fields: Fields, name: string): void;
  export function fieldsAppend(fields: Fields, name: string, value: string): void;
  export function fieldsEntries(fields: Fields): [string, string][];
  export function fieldsClone(fields: Fields): Fields;
  export function finishIncomingStream(s: IncomingStream): Trailers | null;
  export function finishOutgoingStream(s: OutgoingStream, trailers: Trailers | null): void;
  export function dropIncomingRequest(request: IncomingRequest): void;
  export function dropOutgoingRequest(request: OutgoingRequest): void;
  export function incomingRequestMethod(request: IncomingRequest): Method;
  export function incomingRequestPath(request: IncomingRequest): string;
  export function incomingRequestQuery(request: IncomingRequest): string;
  export function incomingRequestScheme(request: IncomingRequest): Scheme | null;
  export function incomingRequestAuthority(request: IncomingRequest): string;
  export function incomingRequestHeaders(request: IncomingRequest): Headers;
  export function incomingRequestConsume(request: IncomingRequest): IncomingStream;
  export function newOutgoingRequest(method: Method, path: string, query: string, scheme: Scheme | null, authority: string, headers: Headers): OutgoingRequest;
  export function outgoingRequestWrite(request: OutgoingRequest): OutgoingStream;
  export function dropResponseOutparam(response: ResponseOutparam): void;
  export function setResponseOutparam(response: Result<OutgoingResponse, Error>): void;
  export function dropIncomingResponse(response: IncomingResponse): void;
  export function dropOutgoingResponse(response: OutgoingResponse): void;
  export function incomingResponseStatus(response: IncomingResponse): StatusCode;
  export function incomingResponseHeaders(response: IncomingResponse): Headers;
  export function incomingResponseConsume(response: IncomingResponse): IncomingStream;
  export function newOutgoingResponse(statusCode: StatusCode, headers: Headers): OutgoingResponse;
  export function outgoingResponseWrite(response: OutgoingResponse): OutgoingStream;
  export function dropFutureIncomingResponse(f: FutureIncomingResponse): void;
  export function futureIncomingResponseGet(f: FutureIncomingResponse): Result<IncomingResponse, Error> | null;
  export function listenToFutureIncomingResponse(f: FutureIncomingResponse): Pollable;
}
export type Fields = number;
import type { InputStream } from '../imports/streams';
export { InputStream };
export type IncomingStream = InputStream;
export type Trailers = Fields;
import type { OutputStream } from '../imports/streams';
export { OutputStream };
export type OutgoingStream = OutputStream;
export type IncomingRequest = number;
export type OutgoingRequest = number;
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
export type Headers = Fields;
export type ResponseOutparam = number;
export type OutgoingResponse = number;
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
export type IncomingResponse = number;
export type StatusCode = number;
export type FutureIncomingResponse = number;
import type { Pollable } from '../imports/poll';
export { Pollable };
export interface RequestOptions {
  connectTimeoutMs?: number,
  firstByteTimeoutMs?: number,
  betweenBytesTimeoutMs?: number,
}
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

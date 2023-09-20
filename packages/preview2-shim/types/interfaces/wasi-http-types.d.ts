export namespace WasiHttpTypes {
  export function dropFields(fields: Fields): void;
  export function newFields(entries: [string, string][]): Fields;
  export function fieldsGet(fields: Fields, name: string): Uint8Array[];
  export function fieldsSet(fields: Fields, name: string, value: Uint8Array[]): void;
  export function fieldsDelete(fields: Fields, name: string): void;
  export function fieldsAppend(fields: Fields, name: string, value: Uint8Array): void;
  export function fieldsEntries(fields: Fields): [string, Uint8Array][];
  export function fieldsClone(fields: Fields): Fields;
  export function finishIncomingStream(s: IncomingStream): Trailers | undefined;
  export function finishOutgoingStream(s: OutgoingStream, trailers: Trailers | undefined): void;
  export function dropIncomingRequest(request: IncomingRequest): void;
  export function dropOutgoingRequest(request: OutgoingRequest): void;
  export function incomingRequestMethod(request: IncomingRequest): Method;
  export function incomingRequestPathWithQuery(request: IncomingRequest): string | undefined;
  export function incomingRequestScheme(request: IncomingRequest): Scheme | undefined;
  export function incomingRequestAuthority(request: IncomingRequest): string | undefined;
  export function incomingRequestHeaders(request: IncomingRequest): Headers;
  export function incomingRequestConsume(request: IncomingRequest): IncomingStream;
  export function newOutgoingRequest(method: Method, pathWithQuery: string | undefined, scheme: Scheme | undefined, authority: string | undefined, headers: Headers): OutgoingRequest;
  export function outgoingRequestWrite(request: OutgoingRequest): OutgoingStream;
  export function dropResponseOutparam(response: ResponseOutparam): void;
  export function setResponseOutparam(param: ResponseOutparam, response: Result<OutgoingResponse, Error>): void;
  export function dropIncomingResponse(response: IncomingResponse): void;
  export function dropOutgoingResponse(response: OutgoingResponse): void;
  export function incomingResponseStatus(response: IncomingResponse): StatusCode;
  export function incomingResponseHeaders(response: IncomingResponse): Headers;
  export function incomingResponseConsume(response: IncomingResponse): IncomingStream;
  export function newOutgoingResponse(statusCode: StatusCode, headers: Headers): OutgoingResponse;
  export function outgoingResponseWrite(response: OutgoingResponse): OutgoingStream;
  export function dropFutureIncomingResponse(f: FutureIncomingResponse): void;
  export function futureIncomingResponseGet(f: FutureIncomingResponse): Result<IncomingResponse, Error> | undefined;
  export function listenToFutureIncomingResponse(f: FutureIncomingResponse): Pollable;
}
import type { InputStream } from '../interfaces/wasi-io-streams';
export { InputStream };
import type { OutputStream } from '../interfaces/wasi-io-streams';
export { OutputStream };
import type { Pollable } from '../interfaces/wasi-poll-poll';
export { Pollable };
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
export type Fields = number;
export type Headers = Fields;
export type Trailers = Fields;
export type IncomingStream = InputStream;
export type OutgoingStream = OutputStream;
export type IncomingRequest = number;
export type OutgoingRequest = number;
export interface RequestOptions {
  connectTimeoutMs?: number,
  firstByteTimeoutMs?: number,
  betweenBytesTimeoutMs?: number,
}
export type ResponseOutparam = number;
export type StatusCode = number;
export type IncomingResponse = number;
export type OutgoingResponse = number;
export type FutureIncomingResponse = number;
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

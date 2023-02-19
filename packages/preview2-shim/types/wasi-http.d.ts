/**
 * # Variants
 * 
 * ## `"get"`
 * 
 * ## `"post"`
 * 
 * ## `"put"`
 * 
 * ## `"delete"`
 * 
 * ## `"patch"`
 * 
 * ## `"head"`
 * 
 * ## `"options"`
 */
export type Method = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options';
export type Uri = string;
export type Headers = [string, string][];
export type Params = [string, string][];
export type Body = Uint8Array;
export interface Request {
  method: Method,
  uri: Uri,
  headers: Headers,
  params: Params,
  body?: Body,
}
export type HttpStatus = number;
export interface Response {
  status: HttpStatus,
  headers?: Headers,
  body?: Body,
}
export type HttpError = HttpErrorInvalidUrl | HttpErrorTimeoutError | HttpErrorProtocolError | HttpErrorUnexpectedError;
export interface HttpErrorInvalidUrl {
  tag: 'invalid-url',
  val: string,
}
export interface HttpErrorTimeoutError {
  tag: 'timeout-error',
  val: string,
}
export interface HttpErrorProtocolError {
  tag: 'protocol-error',
  val: string,
}
export interface HttpErrorUnexpectedError {
  tag: 'unexpected-error',
  val: string,
}
export namespace WasiHttp {
  export function send(req: Request): Response;
}

/** @module Interface wasi:http/client@0.3.0-rc-2026-02-09 **/
/**
 * This function may be used to either send an outgoing request over the
 * network or to forward it to another component.
 */
export function send(request: Request): Promise<Response>;
export type Request = import('./wasi-http-types.js').Request;
export type Response = import('./wasi-http-types.js').Response;
export type ErrorCode = import('./wasi-http-types.js').ErrorCode;

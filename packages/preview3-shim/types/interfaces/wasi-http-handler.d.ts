/** @module Interface wasi:http/handler@0.3.0-rc-2026-02-09 **/
/**
 * This function may be called with either an incoming request read from the
 * network or a request synthesized or forwarded by another component.
 */
export function handle(request: Request): Promise<Response>;
export type Request = import('./wasi-http-types.js').Request;
export type Response = import('./wasi-http-types.js').Response;
export type ErrorCode = import('./wasi-http-types.js').ErrorCode;

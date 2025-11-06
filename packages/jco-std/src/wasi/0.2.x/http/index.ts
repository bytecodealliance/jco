/**
 * This file implements helpers and relevant types for use with `wasi:http` 0.2.x APIs
 *
 * The types in this file are meant to represent an abstraction over versions in wasi 0.2.x APIs,
 * but not the complete list, as trying to replicate the full type tree here would be wasteful/pointless.
 *
 * @see: https://github.com/WebAssembly/wasi-http
 */

export type WASIHTTPMethodLike = SimpleWASIMethod | OtherWASIMethod;
export interface SimpleWASIMethod {
    tag: 'get' | 'head' | 'post' | 'put' | 'delete' | 'connect' | 'options' | 'trace' | 'patch',
}
export interface OtherWASIMethod {
    tag: 'other',
    val: string,
}
export type HTTPMethod = 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE' | 'PATCH' | string;

/** Convert an object similar to a `wasi:http@0.2.x#method` to a HTTP method string */
export function wasiHTTPMethodToString(wasiMethod: WASIHTTPMethodLike): HTTPMethod {
    if (!wasiMethod?.tag) {
        throw new TypeError(
            'invalid wasi HTTP method variant, does not contain tag'
        );
    }
    switch (wasiMethod.tag) {
    case 'get':
    case 'head':
    case 'post':
    case 'put':
    case 'delete':
    case 'connect':
    case 'options':
    case 'trace':
    case 'patch':
        return wasiMethod.tag.toUpperCase();
    case 'other':
        if (!wasiMethod.val || typeof wasiMethod.val !== 'string') {
            throw new TypeError(
                "HTTP method variant 'other' with missing/invaldi payload"
            );
        }
        return wasiMethod.val;
    default:
        throw new TypeError(
            `unrecognized wasi HTTP method tag [${wasiMethod}]`
        );
    }
}

/** Arguments to `requestShouldHaveBody()` */
interface ReqeustShouldHaveBodyArgs {
    method: string,
}

/** Helper for determining whether a request should have a body */
export function requestShouldHaveBody(args: ReqeustShouldHaveBodyArgs): boolean {
    const { method } = args;
    if (method === "GET" || method === "HEAD") { return false; }
    return true;
}

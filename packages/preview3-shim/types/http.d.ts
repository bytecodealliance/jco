export * as client from "./interfaces/wasi-http-client";
export * as handler from "./interfaces/wasi-http-handler";
export * as types from "./interfaces/wasi-http-types";
export function _setHandler(nextHandler: typeof handler | null): typeof handler | null;

import { Fields } from "./http/fields.js";
import { Request, RequestOptions } from "./http/request.js";
import { Response } from "./http/response.js";

export * from "./http/client.js";
export * from "./http/error.js";
export * from "./http/fields.js";
export * from "./http/request.js";
export * from "./http/response.js";
export * from "./http/server.js";

let currentHandler = null;

export const handler = {
  handle(request) {
    if (!currentHandler) {
      throw new Error("wasi:http/handler import is not configured");
    }
    return currentHandler.handle(request);
  },
};

export function _setHandler(nextHandler) {
  const previous = currentHandler;
  currentHandler = nextHandler;
  return previous;
}

export const types = {
  Fields,
  Request,
  RequestOptions,
  Response,
};

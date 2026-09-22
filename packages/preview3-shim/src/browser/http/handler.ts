import type { Request, Response } from "../../../types/interfaces/wasi-http-handler.d.ts";

type Handler = { handle(request: Request): Promise<Response> | Response };
let currentHandler: Handler | undefined;

async function handle(request: Request): Promise<Response> {
  if (!currentHandler) {
    throw new Error("wasi:http/handler import is not configured");
  }
  return currentHandler.handle(request);
}

export function _setHandler(handler: Handler | undefined): Handler | undefined {
  const previous = currentHandler;
  currentHandler = handler;
  return previous;
}

export default {
  handle,
} satisfies typeof import("../../../types/interfaces/wasi-http-handler.d.ts");
export type * from "../../../types/interfaces/wasi-http-handler.d.ts";

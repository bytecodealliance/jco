import { Todo } from "../../common/errors.js";
import type { Request, Response } from "../../../types/interfaces/wasi-http-handler.d.ts";

function handle(request: Request): Promise<Response> {
  throw new Todo();
}

export default {
  handle,
} satisfies typeof import("../../../types/interfaces/wasi-http-handler.d.ts");
export type * from "../../../types/interfaces/wasi-http-handler.d.ts";

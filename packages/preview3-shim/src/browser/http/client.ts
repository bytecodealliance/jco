import { Todo } from "../../common/errors.js";
import type { Request, Response } from "../../../types/interfaces/wasi-http-client.d.ts";

function send(request: Request): Promise<Response> {
  throw new Todo();
}

export default {
  send,
} satisfies typeof import("../../../types/interfaces/wasi-http-client.d.ts");
export type * from "../../../types/interfaces/wasi-http-client.d.ts";

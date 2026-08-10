import { Todo } from "../../common/errors.js";
import type { Result, ErrorCode } from "../../../types/interfaces/wasi-cli-stdin.d.ts";

function readViaStream(): [ReadableStream<number>, Promise<Result<void, ErrorCode>>] {
  throw new Todo();
}

export default {
  readViaStream,
} satisfies typeof import("../../../types/interfaces/wasi-cli-stdin.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stdin.d.ts";

import { Todo } from "../../common/errors.js";
import type { Result, ErrorCode } from "../../../types/interfaces/wasi-cli-stderr.d.ts";

function writeViaStream(data: ReadableStream<number>): Promise<Result<void, ErrorCode>> {
  throw new Todo();
}

export default {
  writeViaStream,
} satisfies typeof import("../../../types/interfaces/wasi-cli-stderr.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stderr.d.ts";

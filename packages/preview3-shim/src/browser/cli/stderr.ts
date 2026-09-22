import { stderr } from "@bytecodealliance/preview2-shim/cli";
import type { Result, ErrorCode } from "../../../types/interfaces/wasi-cli-stderr.d.ts";
import { preview2StreamErrorCode, writeToPreview2Output } from "../streams.js";

async function writeViaStream(data: ReadableStream<number>): Promise<Result<void, ErrorCode>> {
  try {
    await writeToPreview2Output(data, stderr.getStderr());
    return { tag: "ok", val: undefined };
  } catch (error) {
    return { tag: "err", val: preview2StreamErrorCode(error) };
  }
}

export default {
  writeViaStream,
} satisfies typeof import("../../../types/interfaces/wasi-cli-stderr.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stderr.d.ts";

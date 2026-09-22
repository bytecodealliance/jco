import { stdin } from "@bytecodealliance/preview2-shim/cli";
import type { Result, ErrorCode } from "../../../types/interfaces/wasi-cli-stdin.d.ts";
import { readableFromPreview2Input } from "../streams.js";

function readViaStream(): [ReadableStream<number>, Promise<Result<void, ErrorCode>>] {
  return readableFromPreview2Input(stdin.getStdin(), () => "io");
}

export default {
  readViaStream,
} satisfies typeof import("../../../types/interfaces/wasi-cli-stdin.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stdin.d.ts";

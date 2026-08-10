import { Todo } from "../../common/errors.js";
import type { Result } from "../../../types/interfaces/wasi-cli-exit.d.ts";

function exit(status: Result<void, void>): void {
  throw new Todo();
}

function exitWithCode(statusCode: number): void {
  throw new Todo();
}

export default {
  exit,
  exitWithCode,
} satisfies typeof import("../../../types/interfaces/wasi-cli-exit.d.ts");
export type * from "../../../types/interfaces/wasi-cli-exit.d.ts";

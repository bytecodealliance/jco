import { Todo } from "../../common/errors.js";
import type { TerminalOutput } from "../../../types/interfaces/wasi-cli-terminal-stdout.d.ts";

function getTerminalStdout(): TerminalOutput | undefined {
  throw new Todo();
}

export default {
  getTerminalStdout,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-stdout.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-stdout.d.ts";

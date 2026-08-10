import { Todo } from "../../common/errors.js";
import type { TerminalOutput } from "../../../types/interfaces/wasi-cli-terminal-stderr.d.ts";

function getTerminalStderr(): TerminalOutput | undefined {
  throw new Todo();
}

export default {
  getTerminalStderr,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-stderr.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-stderr.d.ts";

import { Todo } from "../../common/errors.js";
import type { TerminalInput } from "../../../types/interfaces/wasi-cli-terminal-stdin.d.ts";

function getTerminalStdin(): TerminalInput | undefined {
  throw new Todo();
}

export default {
  getTerminalStdin,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-stdin.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-stdin.d.ts";

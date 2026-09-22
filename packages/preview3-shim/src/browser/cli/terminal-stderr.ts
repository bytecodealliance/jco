import { terminalStderr } from "@bytecodealliance/preview2-shim/cli";
import type { TerminalOutput } from "../../../types/interfaces/wasi-cli-terminal-stderr.d.ts";

function getTerminalStderr(): TerminalOutput | undefined {
  return terminalStderr.getTerminalStderr();
}

export default {
  getTerminalStderr,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-stderr.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-stderr.d.ts";

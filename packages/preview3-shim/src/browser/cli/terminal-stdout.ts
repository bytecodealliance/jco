import { terminalStdout } from "@bytecodealliance/preview2-shim/cli";
import type { TerminalOutput } from "../../../types/interfaces/wasi-cli-terminal-stdout.d.ts";

function getTerminalStdout(): TerminalOutput | undefined {
  return terminalStdout.getTerminalStdout();
}

export default {
  getTerminalStdout,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-stdout.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-stdout.d.ts";

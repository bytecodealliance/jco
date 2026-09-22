import { terminalStdin } from "@bytecodealliance/preview2-shim/cli";
import type { TerminalInput } from "../../../types/interfaces/wasi-cli-terminal-stdin.d.ts";

function getTerminalStdin(): TerminalInput | undefined {
  return terminalStdin.getTerminalStdin();
}

export default {
  getTerminalStdin,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-stdin.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-stdin.d.ts";

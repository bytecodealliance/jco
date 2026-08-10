import type { TerminalOutput as TerminalOutputT } from "../../../types/interfaces/wasi-cli-terminal-output.d.ts";

class TerminalOutput implements TerminalOutputT {}

export default {
  TerminalOutput,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-output.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-output.d.ts";

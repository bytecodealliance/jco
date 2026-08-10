import type { TerminalInput as TerminalInputT } from "../../../types/interfaces/wasi-cli-terminal-input.d.ts";

class TerminalInput implements TerminalInputT {}

export default {
  TerminalInput,
} satisfies typeof import("../../../types/interfaces/wasi-cli-terminal-input.d.ts");
export type * from "../../../types/interfaces/wasi-cli-terminal-input.d.ts";

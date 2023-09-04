export namespace WasiCliTerminalStderr {
  /**
   * If stderr is connected to a terminal, return a `terminal-output` handle
   * allowing further interaction with it.
   */
  export function getTerminalStderr(): TerminalOutput | null;
}
import type { TerminalOutput } from '../exports/wasi-cli-terminal-output';
export { TerminalOutput };
